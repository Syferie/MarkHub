package main

import (
	"bytes"
	"crypto/rand"  // Added for JWT secret generation
	"encoding/hex" // Added for JWT secret generation
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url" // Used for parsing POCKETBASE_URL
	"os"
	"path"
	"strconv" // Added for Favicon logic
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	// "github.com/labstack/echo/v4" // No longer directly needed after refactor
	// "github.com/pocketbase/pocketbase/models"    // ENSURE THIS IS REMOVED or not present if v0.28.1+
	// "github.com/pocketbase/pocketbase/tools/router" // No longer needed for RegisterRefreshFaviconRoute signature
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/types" // Added for types.JsonRaw
	"github.com/studio-b12/gowebdav"
	"golang.org/x/net/html" // 用于HTML解析

	// Load migrations
	_ "markhub-backend/migrations"
)

// WebDAVConfig defines the structure for WebDAV configuration.
type WebDAVConfig struct {
	Url      string `json:"Url"`
	Username string `json:"Username"`
	Password string `json:"Password"`
	Path     string `json:"Path"`
	AutoSync bool   `json:"AutoSync"`
}

// UserSettingsBackupData defines the structure for user settings in backup.
type UserSettingsBackupData struct {
	TagList     []string `json:"tagList,omitempty"`
	DarkMode    bool     `json:"darkMode"` // Booleans usually aren't omitempty if false is a valid state
	AccentColor string   `json:"accentColor,omitempty"`
	DefaultView string   `json:"defaultView,omitempty"`
	Language    string   `json:"language,omitempty"`
	// Add other settings like SortOption, SearchFields if they need to be synced
	// SortOption  string   `json:"sortOption,omitempty"`
	// SearchFields []string `json:"searchFields,omitempty"` // Assuming SearchFields is stored as []string in user_settings
}

// WebDAVBackupData 定义备份数据的结构
type WebDAVBackupData struct {
	Version      string                 `json:"version"`
	Bookmarks    []BookmarkBackup       `json:"bookmarks"`
	Folders      []FolderBackup         `json:"folders"`
	UserSettings UserSettingsBackupData `json:"userSettings,omitempty"` // Added field for user settings
}

// BookmarkBackup 定义书签备份数据结构
type BookmarkBackup struct {
	OriginalID string   `json:"id"`                 // 备份文件中的原始ID
	FolderID   string   `json:"folderId,omitempty"` // 备份文件中的原始 folderId
	URL        string   `json:"url"`
	Title      string   `json:"title"`
	Tags       []string `json:"tags,omitempty"`
	FaviconURL string   `json:"faviconUrl,omitempty"`
	CreatedAt  string   `json:"createdAt,omitempty"`
	UpdatedAt  string   `json:"updatedAt,omitempty"`
}

// FolderBackup 定义文件夹备份数据结构
type FolderBackup struct {
	OriginalID string `json:"id"`                 // 备份文件中的原始ID
	ParentID   string `json:"parentId,omitempty"` // 备份文件中的原始 parentId
	Name       string `json:"name"`
	CreatedAt  string `json:"createdAt,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
}

// 辅助函数：解密密码
func decryptPassword(encrypted string) (string, error) {
	// TODO: 实现实际的解密逻辑，这里仅为占位符
	// 在真实实现中，应该使用加密密钥和合适的解密算法
	// 目前简单返回加密的值
	return encrypted, nil
}

// suggestFolderHandler handles the API request for AI folder suggestions.
// It requires authentication, accepts bookmark title and URL, fetches page content,
// and then asks AI to suggest one existing folder.
func suggestFolderHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		// Parse request body for title and URL
		var requestData struct {
			Title string `json:"title"`
			URL   string `json:"url"`
		}
		if err := e.BindBody(&requestData); err != nil {
			return e.BadRequestError("Failed to parse request data (expected title and url)", err)
		}
		if requestData.Title == "" || requestData.URL == "" {
			return e.BadRequestError("Title and URL are required for folder suggestion.", nil)
		}

		// Fetch user's Gemini API settings
		userSettings, err := app.FindFirstRecordByFilter(
			"user_settings",
			"userId = {:userId}",
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.NotFoundError("User settings not found for folder suggestion.", err)
		}
		geminiApiKey := userSettings.GetString("geminiApiKey")
		geminiApiBaseUrl := userSettings.GetString("geminiApiBaseUrl")
		geminiModelName := userSettings.GetString("geminiModelName")

		if geminiApiKey == "" {
			return e.BadRequestError("Gemini API configuration not found in user settings for folder suggestion.", nil)
		}

		// Fetch page content and metadata
		pageData, err := fetchPageContent(requestData.URL, app)
		if err != nil {
			log.Printf("SuggestFolder: Failed to fetch page content for URL %s: %v. Proceeding with title and URL only.", requestData.URL, err)
		}

		// Fetch user's existing folders
		folderRecords, err := app.FindRecordsByFilter(
			"folders",
			"userId = {:userId}",
			"", // sort
			0,  // limit
			0,  // offset
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.InternalServerError("Failed to fetch user's folders.", err)
		}
		if len(folderRecords) == 0 {
			return e.JSON(http.StatusOK, map[string]string{"suggested_folder": ""}) // No folders to suggest from
		}
		existingFolderNames := make([]string, len(folderRecords))
		for i, record := range folderRecords {
			existingFolderNames[i] = record.GetString("name")
		}

		// Prepare AI prompt
		apiBaseUrl := geminiApiBaseUrl
		if apiBaseUrl == "" {
			apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/"
		}
		modelName := geminiModelName
		if modelName == "" {
			modelName = "gemini-2.0-flash" // Or a model suitable for classification/suggestion
		}

		systemMessage := "You are a professional bookmark organization assistant. Your ONLY task is to select the most appropriate folder for a bookmark from the user's existing folders. You MUST select ONE folder from the provided list - creating new folder names is STRICTLY FORBIDDEN. Analyze the webpage's title, URL, and content, then return ONLY a JSON response in the format {\"folder_name\": \"ChosenFolderName\"}. If multiple folders seem appropriate, choose the single best match. You CANNOT suggest a new folder name or return an empty result - you MUST select from the provided list only."

		userPrompt := fmt.Sprintf("分析以下网页信息以选择合适的文件夹：\n\n原始书签标题: %s\n网页URL: %s", requestData.Title, requestData.URL)

		if pageData.MetaTitle != "" {
			userPrompt += fmt.Sprintf("\n网页Meta标题: %s", pageData.MetaTitle)
		}
		if pageData.MetaDescription != "" {
			userPrompt += fmt.Sprintf("\n网页Meta描述: %s", pageData.MetaDescription)
		}
		if pageData.OGTitle != "" {
			userPrompt += fmt.Sprintf("\n网页OG标题: %s", pageData.OGTitle)
		}
		if pageData.OGDescription != "" {
			userPrompt += fmt.Sprintf("\n网页OG描述: %s", pageData.OGDescription)
		}

		if pageData.Content != "" {
			maxContentLength := 10000
			content := pageData.Content
			if len(content) > maxContentLength {
				content = content[:maxContentLength]
			}
			userPrompt += fmt.Sprintf("\n\n网页主要内容摘要:\n%s", content)
		}

		userPrompt += fmt.Sprintf("\n\n这是用户现有的文件夹列表: %v。\n\n重要提示：您必须从此列表中选择一个文件夹。请勿创建新的文件夹名称。请勿返回空结果。请从列表中选择最合适的单个文件夹，即使相关性看起来一般。这对于维护用户的有组织的书签结构至关重要。", existingFolderNames)

		requestBody, _ := json.Marshal(map[string]interface{}{
			"model": modelName,
			"messages": []map[string]interface{}{
				{"role": "system", "content": systemMessage},
				{"role": "user", "content": userPrompt},
			},
			"temperature":     0.2,
			"max_tokens":      50,
			"response_format": map[string]string{"type": "json_object"},
		})

		httpClient := &http.Client{Timeout: 25 * time.Second}
		finalApiUrl := apiBaseUrl
		if !strings.HasSuffix(finalApiUrl, "/") {
			finalApiUrl += "/"
		}
		aiReq, err := http.NewRequest("POST", finalApiUrl+"chat/completions", bytes.NewBuffer(requestBody))
		if err != nil {
			return e.InternalServerError("SuggestFolder: Failed to create AI HTTP request.", err)
		}
		aiReq.Header.Set("Content-Type", "application/json")
		aiReq.Header.Set("Authorization", "Bearer "+geminiApiKey)

		aiResp, err := httpClient.Do(aiReq)
		if err != nil {
			return e.InternalServerError("SuggestFolder: Failed to call AI API.", err)
		}
		defer aiResp.Body.Close()

		if aiResp.StatusCode != http.StatusOK {
			var errorResponse map[string]interface{}
			json.NewDecoder(aiResp.Body).Decode(&errorResponse)
			return e.InternalServerError(fmt.Sprintf("SuggestFolder: AI API returned non-200 status: %d", aiResp.StatusCode), errorResponse)
		}

		var aiResult map[string]interface{}
		if err := json.NewDecoder(aiResp.Body).Decode(&aiResult); err != nil {
			return e.InternalServerError("SuggestFolder: Failed to parse AI API response.", err)
		}

		suggestedFolder := ""
		if choices, ok := aiResult["choices"].([]interface{}); ok && len(choices) > 0 {
			if choice, ok := choices[0].(map[string]interface{}); ok {
				if message, ok := choice["message"].(map[string]interface{}); ok {
					if content, ok := message["content"].(string); ok {
						var folderResponse struct {
							FolderName string `json:"folder_name"`
						}
						cleanContent := strings.TrimSpace(content)
						if strings.HasPrefix(cleanContent, "```json") {
							cleanContent = strings.TrimPrefix(cleanContent, "```json")
							cleanContent = strings.TrimSuffix(cleanContent, "```")
						} else if strings.HasPrefix(cleanContent, "```") {
							cleanContent = strings.TrimPrefix(cleanContent, "```")
							cleanContent = strings.TrimSuffix(cleanContent, "```")
						}
						cleanContent = strings.TrimSpace(cleanContent)
						if err := json.Unmarshal([]byte(cleanContent), &folderResponse); err == nil {
							isValidSuggestion := false
							trimmedAISuggestion := strings.TrimSpace(folderResponse.FolderName)

							var matchedExistingName string
							for _, existingName := range existingFolderNames {
								trimmedExistingName := strings.TrimSpace(existingName)
								if strings.EqualFold(trimmedAISuggestion, trimmedExistingName) {
									isValidSuggestion = true
									matchedExistingName = existingName
									break
								}
							}

							if isValidSuggestion {
								suggestedFolder = matchedExistingName
							} else if folderResponse.FolderName != "" {
								log.Printf("SuggestFolder: AI suggested a folder '%s' not in the user's list %v after trimming. Returning empty suggestion.", trimmedAISuggestion, existingFolderNames)
							}
						} else {
							log.Printf("SuggestFolder: Failed to parse AI folder suggestion JSON: %v. Raw content: %s", err, cleanContent)
						}
					}
				}
			}
		}

		return e.JSON(http.StatusOK, map[string]string{"suggested_folder": suggestedFolder})
	}
}

// ensureFolderPathHandler handles the API request for ensuring a folder path exists.
// It accepts a folder path array and returns the final folder ID, creating folders as needed.
func ensureFolderPathHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return e.UnauthorizedError("Authentication required for folder path operations.", nil)
		}

		var requestData struct {
			FolderPath []string `json:"folderPath"`
		}

		if err := e.BindBody(&requestData); err != nil {
			return e.BadRequestError("Invalid request body for folder path operation.", err)
		}

		if len(requestData.FolderPath) == 0 {
			// Root folder case
			return e.JSON(http.StatusOK, map[string]interface{}{
				"folderId": nil,
				"created":  []string{},
			})
		}

		userId := authRecord.Id
		createdFolders := []string{}
		var currentParentId *string = nil

		// Get all user's folders once
		folderRecords, err := app.FindRecordsByFilter(
			"folders",
			"userId = {:userId}",
			"", // sort
			0,  // limit
			0,  // offset
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.InternalServerError("Failed to fetch user's folders.", err)
		}

		// Create a map for quick lookup: "name:parentId" -> folder record
		folderMap := make(map[string]*core.Record)
		for _, record := range folderRecords {
			name := record.GetString("name")
			parentId := record.GetString("parentId")
			key := name + ":" + parentId
			folderMap[key] = record
		}

		// Process each folder in the path
		for _, folderName := range requestData.FolderPath {
			parentIdStr := ""
			if currentParentId != nil {
				parentIdStr = *currentParentId
			}
			
			lookupKey := folderName + ":" + parentIdStr
			
			if existingFolder, exists := folderMap[lookupKey]; exists {
				// Folder exists, use its ID
				currentParentId = &existingFolder.Id
			} else {
				// Folder doesn't exist, create it
				collection, err := app.FindCollectionByNameOrId("folders")
				if err != nil {
					return e.InternalServerError("Failed to find folders collection.", err)
				}

				newFolder := core.NewRecord(collection)
				newFolder.Set("userId", userId)
				newFolder.Set("name", folderName)
				if currentParentId != nil {
					newFolder.Set("parentId", *currentParentId)
				}

				if err := app.Save(newFolder); err != nil {
					return e.InternalServerError("Failed to create folder: "+folderName, err)
				}

				currentParentId = &newFolder.Id
				createdFolders = append(createdFolders, folderName)
				
				// Add to map for subsequent lookups in this request
				newKey := folderName + ":" + parentIdStr
				folderMap[newKey] = newFolder
				
				log.Printf("EnsureFolderPath: Created folder '%s' with ID: %s", folderName, newFolder.Id)
			}
		}

		return e.JSON(http.StatusOK, map[string]interface{}{
			"folderId": currentParentId,
			"created":  createdFolders,
		})
	}
}

// syncExportDataHandler handles the API request for exporting sync data.
// It returns all user's bookmarks and folders with optimized structure for reverse sync.
func syncExportDataHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return e.UnauthorizedError("Authentication required for sync export.", nil)
		}
		userId := authRecord.Id

		// Parse optional query parameters
		lastSyncTime := e.Request.URL.Query().Get("lastSyncTime")
		
		// Build filter for incremental sync if lastSyncTime is provided
		bookmarkFilter := "userId = {:userId}"
		folderFilter := "userId = {:userId}"
		params := dbx.Params{"userId": userId}
		
		if lastSyncTime != "" {
			// Add time filter for incremental sync
			bookmarkFilter += " && updatedAt > {:lastSyncTime}"
			folderFilter += " && updatedAt > {:lastSyncTime}"
			params["lastSyncTime"] = lastSyncTime
		}

		// Fetch user's bookmarks
		bookmarkRecords, err := app.FindRecordsByFilter(
			"bookmarks",
			bookmarkFilter,
			"", // sort
			0,  // limit
			0,  // offset
			params,
		)
		if err != nil {
			return e.InternalServerError("Failed to fetch user's bookmarks for sync export.", err)
		}

		// Fetch user's folders
		folderRecords, err := app.FindRecordsByFilter(
			"folders",
			folderFilter,
			"", // sort
			0,  // limit
			0,  // offset
			params,
		)
		if err != nil {
			return e.InternalServerError("Failed to fetch user's folders for sync export.", err)
		}

		// Build folder path mapping for efficient lookup
		folderMap := make(map[string]*core.Record)
		for _, record := range folderRecords {
			folderMap[record.Id] = record
		}

		// Helper function to build folder path recursively
		var buildFolderPath func(folderId string) []string
		buildFolderPath = func(folderId string) []string {
			if folderId == "" {
				return []string{}
			}
			
			folder, exists := folderMap[folderId]
			if !exists {
				return []string{}
			}
			
			parentId := folder.GetString("parentId")
			if parentId == "" {
				return []string{folder.GetString("name")}
			}
			
			parentPath := buildFolderPath(parentId)
			return append(parentPath, folder.GetString("name"))
		}

		// Prepare folders data with paths
		folders := make([]map[string]interface{}, 0, len(folderRecords))
		for _, record := range folderRecords {
			folderPath := buildFolderPath(record.Id)
			
			folder := map[string]interface{}{
				"id":        record.Id,
				"name":      record.GetString("name"),
				"parentId":  record.GetString("parentId"),
				"path":      folderPath,
				"createdAt": record.GetString("createdAt"),
				"updatedAt": record.GetString("updatedAt"),
			}
			
			// Handle empty parentId
			if record.GetString("parentId") == "" {
				folder["parentId"] = nil
			}
			
			folders = append(folders, folder)
		}

		// Prepare bookmarks data with folder paths
		bookmarks := make([]map[string]interface{}, 0, len(bookmarkRecords))
		for _, record := range bookmarkRecords {
			folderId := record.GetString("folderId")
			var folderPath []string
			
			if folderId != "" {
				folderPath = buildFolderPath(folderId)
			} else {
				folderPath = []string{}
			}
			
			bookmark := map[string]interface{}{
				"id":                record.Id,
				"title":             record.GetString("title"),
				"url":               record.GetString("url"),
				"folderId":          record.GetString("folderId"),
				"folderPath":        folderPath,
				"tags":              record.GetStringSlice("tags"),
				"isFavorite":        record.GetBool("isFavorite"),
				"chromeBookmarkId":  record.GetString("chromeBookmarkId"),
				"createdAt":         record.GetString("createdAt"),
				"updatedAt":         record.GetString("updatedAt"),
			}
			
			// Handle empty folderId
			if record.GetString("folderId") == "" {
				bookmark["folderId"] = nil
			}
			
			// Handle empty chromeBookmarkId
			if record.GetString("chromeBookmarkId") == "" {
				bookmark["chromeBookmarkId"] = nil
			}
			
			bookmarks = append(bookmarks, bookmark)
		}

		// Prepare sync metadata
		syncMetadata := map[string]interface{}{
			"totalFolders":   len(folders),
			"totalBookmarks": len(bookmarks),
			"exportTime":     time.Now().UTC().Format(time.RFC3339),
			"isIncremental":  lastSyncTime != "",
		}

		// Prepare response
		response := map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"folders":      folders,
				"bookmarks":    bookmarks,
				"syncMetadata": syncMetadata,
			},
		}

		return e.JSON(http.StatusOK, response)
	}
}

// webdavBackupHandler handles the WebDAV backup request.
func webdavBackupHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		userSettings, err := app.FindFirstRecordByFilter(
			"user_settings",
			"userId = {:userId}",
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.NotFoundError("User settings not found.", err)
		}

		webdavConfigRaw := userSettings.Get("webdav_config")
		if webdavConfigRaw == nil {
			return e.BadRequestError("WebDAV configuration not found or is null in user settings.", nil)
		}

		var webdavConfig WebDAVConfig
		var webdavConfigBytes []byte

		switch v := webdavConfigRaw.(type) {
		case nil:
			return e.BadRequestError("WebDAV configuration is null.", nil)
		case types.JSONRaw:
			webdavConfigBytes = []byte(v)
		case json.RawMessage:
			webdavConfigBytes = []byte(v)
		case string:
			webdavConfigBytes = []byte(v)
		case []byte:
			webdavConfigBytes = v
		case map[string]any:
			webdavConfigBytes, err = json.Marshal(v)
			if err != nil {
				return e.InternalServerError("Failed to re-marshal webdav_config from map[string]any.", err)
			}
		default:
			log.Printf("Unexpected type for webdav_config: %T, value: %v", v, v)
			return e.InternalServerError("Unexpected type for webdav_config. Expected string, []byte, json.RawMessage, or map[string]any.", nil)
		}

		if len(webdavConfigBytes) == 0 {
			return e.BadRequestError("WebDAV configuration is empty after type assertion.", nil)
		}

		if err := json.Unmarshal(webdavConfigBytes, &webdavConfig); err != nil {
			return e.BadRequestError("Failed to parse WebDAV configuration.", err)
		}

		decryptedPassword, err := decryptPassword(webdavConfig.Password)
		if err != nil {
			return e.InternalServerError("Failed to decrypt WebDAV password.", err)
		}

		bookmarkRecords, err := app.FindRecordsByFilter(
			"bookmarks",
			"userId = {:userId}",
			"", 0, 0,
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.InternalServerError("Failed to fetch bookmarks for backup.", err)
		}

		folderRecords, err := app.FindRecordsByFilter(
			"folders",
			"userId = {:userId}",
			"", 0, 0,
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.InternalServerError("Failed to fetch folders for backup.", err)
		}

		var backupData WebDAVBackupData
		backupData.Version = "1.0.0"

		backupData.Bookmarks = make([]BookmarkBackup, 0, len(bookmarkRecords))
		for _, record := range bookmarkRecords {
			bookmark := BookmarkBackup{
				OriginalID: record.Id,
				FolderID:   record.GetString("folderId"),
				URL:        record.GetString("url"),
				Title:      record.GetString("title"),
				Tags:       record.GetStringSlice("tags"),
				FaviconURL: record.GetString("faviconUrl"),
				CreatedAt:  record.GetString("createdAt"),
				UpdatedAt:  record.GetString("updatedAt"),
			}
			backupData.Bookmarks = append(backupData.Bookmarks, bookmark)
		}

		backupData.Folders = make([]FolderBackup, 0, len(folderRecords))
		for _, record := range folderRecords {
			folder := FolderBackup{
				OriginalID: record.Id,
				ParentID:   record.GetString("parentId"),
				Name:       record.GetString("name"),
				CreatedAt:  record.GetString("createdAt"),
				UpdatedAt:  record.GetString("updatedAt"),
			}
			backupData.Folders = append(backupData.Folders, folder)
		}

		// 3a. Get user_settings data
		var userSettingsData UserSettingsBackupData
		userSettingsRecord, errSettings := app.FindFirstRecordByFilter(
			"user_settings",
			"userId = {:userId}",
			dbx.Params{"userId": userId},
		)
		if errSettings != nil {
			log.Printf("WebDAV Backup: User settings not found for user %s, settings will not be backed up. Error: %v", userId, errSettings)
			// Not treating as a fatal error, backup will proceed without these settings.
		} else if userSettingsRecord != nil {
			userSettingsData.TagList = userSettingsRecord.GetStringSlice("tagList")
			userSettingsData.DarkMode = userSettingsRecord.GetBool("darkMode")
			userSettingsData.AccentColor = userSettingsRecord.GetString("accentColor")
			userSettingsData.DefaultView = userSettingsRecord.GetString("defaultView")
			userSettingsData.Language = userSettingsRecord.GetString("language")
			// userSettingsData.SortOption = userSettingsRecord.GetString("sortOption") // Uncomment if needed
			// userSettingsData.SearchFields = userSettingsRecord.GetStringSlice("searchFields") // Uncomment if needed
			backupData.UserSettings = userSettingsData
			log.Printf("WebDAV Backup: User settings included for user %s.", userId)
		}

		// 4. 序列化数据
		jsonData, err := json.MarshalIndent(backupData, "", "  ")
		if err != nil {
			return e.InternalServerError("Failed to serialize backup data.", err)
		}

		client := gowebdav.NewClient(webdavConfig.Url, webdavConfig.Username, decryptedPassword)

		backupFileName := fmt.Sprintf("backup_%s.json", time.Now().Format("20060102_150405"))
		remotePath := path.Join(webdavConfig.Path, backupFileName)

		err = client.MkdirAll(webdavConfig.Path, 0755)
		if err != nil {
			log.Printf("Warning: Failed to create WebDAV directories %s: %v", webdavConfig.Path, err)
		}

		err = client.Write(remotePath, jsonData, 0644)
		if err != nil {
			return e.InternalServerError(fmt.Sprintf("Failed to upload backup to WebDAV server at %s", remotePath), err)
		}

		log.Printf("Successfully backed up data for user %s to WebDAV server at %s", userId, remotePath)
		return e.JSON(http.StatusOK, map[string]interface{}{
			"success":  true,
			"message":  "Backup successful",
			"fileName": backupFileName,
		})
	}
}

// suggestTagsForBookmarkHandler 处理书签标签建议请求
func suggestTagsForBookmarkHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		var requestData struct {
			Title            string   `json:"title"`
			URL              string   `json:"url"`
			ExistingUserTags []string `json:"existingUserTags"`
		}

		if err := e.BindBody(&requestData); err != nil {
			return e.BadRequestError("Failed to parse request data", err)
		}

		if requestData.Title == "" || requestData.URL == "" {
			return e.BadRequestError("Title and URL are required", nil)
		}

		userSettings, err := e.App.FindFirstRecordByFilter(
			"user_settings",
			"userId = {:userId}",
			dbx.Params{"userId": userId},
		)

		if err != nil {
			return e.NotFoundError("User settings not found", err)
		}

		geminiApiKey := userSettings.GetString("geminiApiKey")
		geminiApiBaseUrl := userSettings.GetString("geminiApiBaseUrl")
		geminiModelName := userSettings.GetString("geminiModelName")

		if geminiApiKey == "" {
			return e.BadRequestError("Gemini API configuration not found in user settings", nil)
		}

		apiBaseUrl := geminiApiBaseUrl
		if apiBaseUrl == "" {
			apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/"
		}

		modelName := geminiModelName
		if modelName == "" {
			modelName = "gemini-2.0-flash"
		}

		systemMessage := "You are a professional bookmark tagging assistant. Your ONLY task is to select relevant tags from the user's existing tag collection. You MUST ONLY choose from the tags provided in the 'existingUserTags' list. DO NOT create new tags. If no existing tags are relevant, return an empty array in the format {\"tags\": []}. Return ONLY a JSON response in the format {\"tags\": [\"tag1\", \"tag2\"]}. Choose 2-3 tags maximum if relevant ones exist."

		pageData, err := fetchPageContent(requestData.URL, app)
		if err != nil {
			log.Printf("Failed to fetch page content for URL %s: %v. Proceeding with title and URL only for tag suggestion.", requestData.URL, err)
		}

		userPrompt := fmt.Sprintf("分析以下网页信息以生成相关标签。\n\n原始书签标题: %s\n网页URL: %s", requestData.Title, requestData.URL)

		if pageData.MetaTitle != "" {
			userPrompt += fmt.Sprintf("\n网页Meta标题: %s", pageData.MetaTitle)
		}
		if pageData.MetaDescription != "" {
			userPrompt += fmt.Sprintf("\n网页Meta描述: %s", pageData.MetaDescription)
		}
		if pageData.OGTitle != "" {
			userPrompt += fmt.Sprintf("\n网页OG标题: %s", pageData.OGTitle)
		}
		if pageData.OGDescription != "" {
			userPrompt += fmt.Sprintf("\n网页OG描述: %s", pageData.OGDescription)
		}

		if pageData.Content != "" {
			maxContentLength := 15000
			content := pageData.Content
			if len(content) > maxContentLength {
				content = content[:maxContentLength]
			}
			userPrompt += fmt.Sprintf("\n\n网页主要内容摘要:\n%s", content)
		}

		if len(requestData.ExistingUserTags) > 0 {
			userPrompt += fmt.Sprintf("\n\nCRITICAL INSTRUCTION: 您必须从用户现有的标签列表 %v 中选择标签。请勿创建任何新标签。如果没有相关的标签，请返回空数组 {\"tags\": []}。最多选择2-3个最相关的标签。创建新标签是严格禁止的，会导致系统错误。", requestData.ExistingUserTags)
		} else {
			userPrompt += "\n\n未提供现有用户标签。由于您只能从现有标签中选择，且没有提供标签，请返回空数组 {\"tags\": []}。"
		}

		requestBody, _ := json.Marshal(map[string]interface{}{
			"model": modelName,
			"messages": []map[string]interface{}{
				{
					"role":    "system",
					"content": systemMessage,
				},
				{
					"role":    "user",
					"content": userPrompt,
				},
			},
			"temperature": 0.3,
			"max_tokens":  200,
			"response_format": map[string]string{
				"type": "json_object",
			},
		})

		var requestBodyForLogging map[string]interface{}
		json.Unmarshal(requestBody, &requestBodyForLogging)
		if messages, ok := requestBodyForLogging["messages"].([]interface{}); ok && len(messages) > 1 {
			if userMessage, ok := messages[1].(map[string]interface{}); ok {
				if content, ok := userMessage["content"].(string); ok && len(content) > 100 {
					userMessage["content"] = strings.Replace(
						content,
						fmt.Sprintf("\n\n网页主要内容摘要:\n%s", pageData.Content),
						"\n\n网页主要内容摘要: [内容已单独记录]",
						1,
					)
					messages[1] = userMessage
				}
			}
		}
		client := &http.Client{
			Timeout: time.Second * 30,
		}

		finalApiUrl := apiBaseUrl
		if geminiApiBaseUrl != "" {
			finalApiUrl = geminiApiBaseUrl
		} else {
			finalApiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/"
		}

		if !strings.HasSuffix(finalApiUrl, "/") {
			finalApiUrl += "/"
		}
		req, err := http.NewRequest("POST", finalApiUrl+"chat/completions", bytes.NewBuffer(requestBody))
		if err != nil {
			return e.InternalServerError("Failed to create HTTP request", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+geminiApiKey)

		resp, err := client.Do(req)
		if err != nil {
			return e.InternalServerError("Failed to call AI API", err)
		}
		defer resp.Body.Close()

		responseBodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return e.InternalServerError("Failed to read AI API response", err)
		}

		if resp.StatusCode != http.StatusOK {
			var errorResponse map[string]interface{}
			if err := json.Unmarshal(responseBodyBytes, &errorResponse); err != nil {
				return e.InternalServerError(fmt.Sprintf("AI API returned non-200 status: %d", resp.StatusCode), nil)
			}
			return e.InternalServerError("AI API error", fmt.Errorf("%v", errorResponse))
		}

		var result map[string]interface{}
		if err := json.Unmarshal(responseBodyBytes, &result); err != nil {
			return e.InternalServerError("Failed to parse AI API response", err)
		}

		var suggestedTags []string

		if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
			if choice, ok := choices[0].(map[string]interface{}); ok {
				if message, ok := choice["message"].(map[string]interface{}); ok {
					if content, ok := message["content"].(string); ok {
						var tagsResponse map[string]interface{}

						cleanContent := content
						if strings.HasPrefix(cleanContent, "```json") {
							cleanContent = strings.TrimPrefix(cleanContent, "```json")
							cleanContent = strings.TrimSuffix(cleanContent, "```")
						} else if strings.HasPrefix(cleanContent, "```") {
							cleanContent = strings.TrimPrefix(cleanContent, "```")
							cleanContent = strings.TrimSuffix(cleanContent, "```")
						}

						cleanContent = strings.TrimSpace(cleanContent)

						if err := json.Unmarshal([]byte(cleanContent), &tagsResponse); err != nil {
							log.Printf("Failed to parse AI response JSON content after cleaning: %v. Raw content: %s", err, cleanContent)
						} else {
							if tags, ok := tagsResponse["tags"].([]interface{}); ok {
								for _, tag := range tags {
									if tagStr, ok := tag.(string); ok {
										suggestedTags = append(suggestedTags, tagStr)
									}
								}
							}
						}
					}
				}
			}
		}

		if len(suggestedTags) == 0 {
			return e.JSON(http.StatusOK, map[string][]string{"suggested_tags": make([]string, 0)})
		}

		return e.JSON(http.StatusOK, map[string]interface{}{
			"suggested_tags": suggestedTags,
		})
	}
}

// aiSuggestAndSetTagsHandler 处理 AI 标签建议并设置到书签的请求
func aiSuggestAndSetTagsHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		// 从路径参数获取 bookmarkId
		bookmarkId := e.Request.PathValue("bookmarkId")
		if bookmarkId == "" {
			return e.BadRequestError("Bookmark ID is required", nil)
		}

		// 查找书签记录
		bookmark, err := app.FindRecordById("bookmarks", bookmarkId)
		if err != nil {
			return e.NotFoundError("Bookmark not found", err)
		}

		// 验证书签属于当前用户
		if bookmark.GetString("userId") != userId {
			return apis.NewForbiddenError("Access denied to this bookmark.", nil)
		}

		// 获取书签的标题和URL
		title := bookmark.GetString("title")
		url := bookmark.GetString("url")

		if title == "" || url == "" {
			return e.BadRequestError("Bookmark title and URL are required for AI tag suggestion", nil)
		}

		// 获取用户设置中的 Gemini API 配置
		userSettings, err := app.FindFirstRecordByFilter(
			"user_settings",
			"userId = {:userId}",
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.NotFoundError("User settings not found", err)
		}

		geminiApiKey := userSettings.GetString("geminiApiKey")
		geminiApiBaseUrl := userSettings.GetString("geminiApiBaseUrl")
		geminiModelName := userSettings.GetString("geminiModelName")

		if geminiApiKey == "" {
			// AI 服务未配置，直接返回错误
			log.Printf("AI API not configured for user %s", userId)
			return e.JSON(http.StatusServiceUnavailable, map[string]interface{}{
				"success": false,
				"message": "AI service (Gemini API) is not configured on the server. Please contact the administrator.",
				"aiUsed": false,
			})
		}

		// 配置 AI API 参数
		apiBaseUrl := geminiApiBaseUrl
		if apiBaseUrl == "" {
			apiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/"
		}

		modelName := geminiModelName
		if modelName == "" {
			modelName = "gemini-2.0-flash"
		}

		// 获取用户现有的标签列表
		existingUserTags := userSettings.GetStringSlice("tagList")

		// 获取页面内容
		pageData, err := fetchPageContent(url, app)
		if err != nil {
			log.Printf("Failed to fetch page content for URL %s: %v. Proceeding with title and URL only for tag suggestion.", url, err)
		}

		// 构造 AI 提示
		systemMessage := "You are a professional bookmark tagging assistant. Your ONLY task is to select relevant tags from the user's existing tag collection. You MUST ONLY choose from the tags provided in the existing user tags list. DO NOT create new tags. If no existing tags are relevant, return an empty array in the format {\"tags\": []}. Return ONLY a JSON response in the format {\"tags\": [\"tag1\", \"tag2\"]}. Choose 2-3 tags maximum if relevant ones exist."

		userPrompt := fmt.Sprintf("分析以下网页信息以生成相关标签。\n\n原始书签标题: %s\n网页URL: %s", title, url)

		if pageData.MetaTitle != "" {
			userPrompt += fmt.Sprintf("\n网页Meta标题: %s", pageData.MetaTitle)
		}
		if pageData.MetaDescription != "" {
			userPrompt += fmt.Sprintf("\n网页Meta描述: %s", pageData.MetaDescription)
		}
		if pageData.OGTitle != "" {
			userPrompt += fmt.Sprintf("\n网页OG标题: %s", pageData.OGTitle)
		}
		if pageData.OGDescription != "" {
			userPrompt += fmt.Sprintf("\n网页OG描述: %s", pageData.OGDescription)
		}

		if pageData.Content != "" {
			maxContentLength := 15000
			content := pageData.Content
			if len(content) > maxContentLength {
				content = content[:maxContentLength]
			}
			userPrompt += fmt.Sprintf("\n\n网页主要内容摘要:\n%s", content)
		}

		if len(existingUserTags) > 0 {
			userPrompt += fmt.Sprintf("\n\nCRITICAL INSTRUCTION: 您必须从用户现有的标签列表 %v 中选择标签。请勿创建任何新标签。如果没有相关的标签，请返回空数组 {\"tags\": []}。最多选择2-3个最相关的标签。创建新标签是严格禁止的，会导致系统错误。", existingUserTags)
		} else {
			userPrompt += "\n\n未提供现有用户标签。由于您只能从现有标签中选择，且没有提供标签，请返回空数组 {\"tags\": []}。"
		}

		// 构造 AI API 请求
		requestBody, _ := json.Marshal(map[string]interface{}{
			"model": modelName,
			"messages": []map[string]interface{}{
				{
					"role":    "system",
					"content": systemMessage,
				},
				{
					"role":    "user",
					"content": userPrompt,
				},
			},
			"temperature": 0.3,
			"max_tokens":  200,
			"response_format": map[string]string{
				"type": "json_object",
			},
		})

		// 调用 AI API
		client := &http.Client{
			Timeout: time.Second * 30,
		}

		finalApiUrl := apiBaseUrl
		if !strings.HasSuffix(finalApiUrl, "/") {
			finalApiUrl += "/"
		}

		req, err := http.NewRequest("POST", finalApiUrl+"chat/completions", bytes.NewBuffer(requestBody))
		if err != nil {
			return e.InternalServerError("Failed to create AI HTTP request", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+geminiApiKey)

		resp, err := client.Do(req)
		if err != nil {
			return e.JSON(http.StatusInternalServerError, map[string]interface{}{
				"success": false,
				"message": "Failed to get suggestions from AI service.",
				"error_details": err.Error(),
				"aiUsed": false,
			})
		}
		defer resp.Body.Close()

		responseBodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			return e.InternalServerError("Failed to read AI API response", err)
		}

		if resp.StatusCode != http.StatusOK {
			var errorResponse map[string]interface{}
			if err := json.Unmarshal(responseBodyBytes, &errorResponse); err != nil {
				return e.JSON(http.StatusBadGateway, map[string]interface{}{
					"success": false,
					"message": "Failed to get suggestions from AI service.",
					"error_details": fmt.Sprintf("AI API returned status: %d", resp.StatusCode),
					"aiUsed": false,
				})
			}
			return e.JSON(http.StatusBadGateway, map[string]interface{}{
				"success": false,
				"message": "Failed to get suggestions from AI service.",
				"error_details": fmt.Sprintf("AI API error: %v", errorResponse),
				"aiUsed": false,
			})
		}

		var result map[string]interface{}
		if err := json.Unmarshal(responseBodyBytes, &result); err != nil {
			return e.InternalServerError("Failed to parse AI API response", err)
		}

		// 解析 AI 响应中的标签
		var suggestedTags []string

		if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
			if choice, ok := choices[0].(map[string]interface{}); ok {
				if message, ok := choice["message"].(map[string]interface{}); ok {
					if content, ok := message["content"].(string); ok {
						var tagsResponse map[string]interface{}

						cleanContent := content
						if strings.HasPrefix(cleanContent, "```json") {
							cleanContent = strings.TrimPrefix(cleanContent, "```json")
							cleanContent = strings.TrimSuffix(cleanContent, "```")
						} else if strings.HasPrefix(cleanContent, "```") {
							cleanContent = strings.TrimPrefix(cleanContent, "```")
							cleanContent = strings.TrimSuffix(cleanContent, "```")
						}

						cleanContent = strings.TrimSpace(cleanContent)

						if err := json.Unmarshal([]byte(cleanContent), &tagsResponse); err != nil {
							log.Printf("Failed to parse AI response JSON content after cleaning: %v. Raw content: %s", err, cleanContent)
						} else {
							if tags, ok := tagsResponse["tags"].([]interface{}); ok {
								for _, tag := range tags {
									if tagStr, ok := tag.(string); ok {
										suggestedTags = append(suggestedTags, tagStr)
									}
								}
							}
						}
					}
				}
			}
		}

		// 如果 AI 没有返回有效标签，返回错误
		if len(suggestedTags) == 0 {
			log.Printf("AI did not return valid tags for bookmark %s", bookmarkId)
			return e.JSON(http.StatusInternalServerError, map[string]interface{}{
				"success": false,
				"message": "AI service failed to generate valid tags for this bookmark.",
				"error_details": "AI response did not contain valid tag suggestions",
				"aiUsed": false,
			})
		}

		// 更新书签的标签
		bookmark.Set("tags", suggestedTags)
		if err := app.Save(bookmark); err != nil {
			return e.InternalServerError("Failed to update bookmark with AI suggested tags", err)
		}

		// 更新用户的标签列表，添加新的标签
		tagList := userSettings.GetStringSlice("tagList")
		newUniqueTags := make([]string, 0)
		for _, tag := range suggestedTags {
			isUnique := true
			for _, existingTag := range tagList {
				if existingTag == tag {
					isUnique = false
					break
				}
			}
			if isUnique {
				newUniqueTags = append(newUniqueTags, tag)
			}
		}

		if len(newUniqueTags) > 0 {
			updatedTagList := append(tagList, newUniqueTags...)
			userSettings.Set("tagList", updatedTagList)
			if err := app.Save(userSettings); err != nil {
				log.Printf("Error saving user_settings during AI tag suggestion: %v", err)
			}
		}

		// 重新获取更新后的书签
		updatedBookmark, err := app.FindRecordById("bookmarks", bookmarkId)
		if err != nil {
			return e.InternalServerError("Failed to fetch updated bookmark", err)
		}

		return e.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Tags suggested and set successfully",
			"bookmark": map[string]interface{}{
				"id":         updatedBookmark.Id,
				"title":      updatedBookmark.GetString("title"),
				"url":        updatedBookmark.GetString("url"),
				"tags":       updatedBookmark.GetStringSlice("tags"),
				"folderId":   updatedBookmark.GetString("folderId"),
				"faviconUrl": updatedBookmark.GetString("faviconUrl"),
				"createdAt":  updatedBookmark.GetString("createdAt"),
				"updatedAt":  updatedBookmark.GetString("updatedAt"),
			},
			"aiUsed": true,
		})
	}
}

// webdavRestoreHandler handles the WebDAV restore request.
func webdavRestoreHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		userSettings, err := app.FindFirstRecordByFilter(
			"user_settings",
			"userId = {:userId}",
			dbx.Params{"userId": userId},
		)
		if err != nil {
			return e.NotFoundError("User settings not found.", err)
		}

		webdavConfigRaw := userSettings.Get("webdav_config")
		if webdavConfigRaw == nil {
			return e.BadRequestError("WebDAV configuration not found or is null in user settings.", nil)
		}

		var webdavConfig WebDAVConfig
		var webdavConfigBytes []byte

		switch v := webdavConfigRaw.(type) {
		case nil:
			return e.BadRequestError("WebDAV configuration is null.", nil)
		case types.JSONRaw:
			webdavConfigBytes = []byte(v)
		case json.RawMessage:
			webdavConfigBytes = []byte(v)
		case string:
			webdavConfigBytes = []byte(v)
		case []byte:
			webdavConfigBytes = v
		case map[string]any:
			webdavConfigBytes, err = json.Marshal(v)
			if err != nil {
				return e.InternalServerError("Failed to re-marshal webdav_config from map[string]any.", err)
			}
		default:
			log.Printf("Unexpected type for webdav_config in restore: %T, value: %v", v, v)
			return e.InternalServerError("Unexpected type for webdav_config. Expected string, []byte, json.RawMessage, or map[string]any.", nil)
		}

		if len(webdavConfigBytes) == 0 {
			return e.BadRequestError("WebDAV configuration is empty after type assertion.", nil)
		}

		if err := json.Unmarshal(webdavConfigBytes, &webdavConfig); err != nil {
			return e.BadRequestError("Failed to parse WebDAV configuration.", err)
		}

		decryptedPassword, err := decryptPassword(webdavConfig.Password)
		if err != nil {
			return e.InternalServerError("Failed to decrypt WebDAV password.", err)
		}

		client := gowebdav.NewClient(webdavConfig.Url, webdavConfig.Username, decryptedPassword)

		var backupFileData []byte
		var downloadedFileName string

		defaultPath := path.Join(webdavConfig.Path, "markhub_backup.json")
		backupFileData, err = client.Read(defaultPath)

		if err != nil {
			log.Printf("Default backup file not found at %s, searching for latest backup...", defaultPath)

			files, err := client.ReadDir(webdavConfig.Path)
			if err != nil {
				return e.InternalServerError(fmt.Sprintf("Failed to list files in WebDAV directory %s", webdavConfig.Path), err)
			}

			var latestFile os.FileInfo
			var latestTime time.Time

			for _, file := range files {
				if !file.IsDir() && strings.HasPrefix(file.Name(), "backup_") && strings.HasSuffix(file.Name(), ".json") {
					if latestFile == nil || file.ModTime().After(latestTime) {
						latestFile = file
						latestTime = file.ModTime()
					}
				}
			}

			if latestFile == nil {
				return e.BadRequestError("No backup files found in WebDAV storage.", nil)
			}

			downloadedFileName = latestFile.Name()
			latestFilePath := path.Join(webdavConfig.Path, downloadedFileName)
			backupFileData, err = client.Read(latestFilePath)

			if err != nil {
				return e.InternalServerError(fmt.Sprintf("Failed to read latest backup file %s", latestFilePath), err)
			}

			log.Printf("Found latest backup file: %s", downloadedFileName)
		} else {
			downloadedFileName = "markhub_backup.json"
		}

		var backupData WebDAVBackupData
		if err := json.Unmarshal(backupFileData, &backupData); err != nil {
			return e.InternalServerError("Failed to parse backup data.", err)
		}

		oldFolderIdToNewFolderIdMap := make(map[string]string)

		for _, folderBackup := range backupData.Folders {
			existingFolder, _ := app.FindFirstRecordByFilter(
				"folders",
				"userId = {:userId} AND name = {:name}",
				dbx.Params{
					"userId": userId,
					"name":   folderBackup.Name,
				},
			)

			var folderRecord *core.Record

			if existingFolder != nil {
				folderRecord = existingFolder
				// Icon field removed - no longer exists in schema
			} else {
				collection, err := app.FindCollectionByNameOrId("folders")
				if err != nil {
					log.Printf("Error finding folders collection: %v", err)
					continue
				}

				folderRecord = core.NewRecord(collection)
				folderRecord.Set("userId", userId)
				folderRecord.Set("name", folderBackup.Name)
				// Icon field removed - no longer exists in schema
			}

			// Set timestamp fields if they exist in backup data
			if folderBackup.CreatedAt != "" {
				folderRecord.Set("createdAt", folderBackup.CreatedAt)
			}
			if folderBackup.UpdatedAt != "" {
				folderRecord.Set("updatedAt", folderBackup.UpdatedAt)
			}

			if err := app.Save(folderRecord); err != nil {
				log.Printf("Error saving folder %s: %v", folderBackup.Name, err)
				continue
			}

			oldFolderIdToNewFolderIdMap[folderBackup.OriginalID] = folderRecord.Id
		}

		for _, folderBackup := range backupData.Folders {
			if folderBackup.ParentID != "" {
				newFolderId, exists := oldFolderIdToNewFolderIdMap[folderBackup.OriginalID]
				newParentId, parentExists := oldFolderIdToNewFolderIdMap[folderBackup.ParentID]

				if exists && parentExists {
					folderRecord, err := app.FindRecordById("folders", newFolderId)
					if err == nil {
						folderRecord.Set("parentId", newParentId)
						if err := app.Save(folderRecord); err != nil {
							log.Printf("Error updating parent folder relationship for %s: %v", folderBackup.Name, err)
						}
					}
				}
			}
		}

		restoredBookmarks := 0
		for _, bookmarkBackup := range backupData.Bookmarks {
			existingBookmark, _ := app.FindFirstRecordByFilter(
				"bookmarks",
				"userId = {:userId} AND url = {:url}",
				dbx.Params{
					"userId": userId,
					"url":    bookmarkBackup.URL,
				},
			)

			var bookmarkRecord *core.Record

			if existingBookmark != nil {
				bookmarkRecord = existingBookmark
				if bookmarkBackup.Title != "" {
					bookmarkRecord.Set("title", bookmarkBackup.Title)
				}
				// Description and Icon fields removed - no longer exist in schema
				if bookmarkBackup.FaviconURL != "" {
					bookmarkRecord.Set("faviconUrl", bookmarkBackup.FaviconURL)
				}
			} else {
				collection, err := app.FindCollectionByNameOrId("bookmarks")
				if err != nil {
					log.Printf("Error finding bookmarks collection: %v", err)
					continue
				}

				bookmarkRecord = core.NewRecord(collection)
				bookmarkRecord.Set("userId", userId)
				bookmarkRecord.Set("url", bookmarkBackup.URL)
				bookmarkRecord.Set("title", bookmarkBackup.Title)

				// Description and Icon fields removed - no longer exist in schema
				if bookmarkBackup.FaviconURL != "" {
					bookmarkRecord.Set("faviconUrl", bookmarkBackup.FaviconURL)
				}
			}

			if bookmarkBackup.FolderID != "" {
				newFolderId, exists := oldFolderIdToNewFolderIdMap[bookmarkBackup.FolderID]
				if exists {
					bookmarkRecord.Set("folderId", newFolderId)
				}
			}

			if len(bookmarkBackup.Tags) > 0 {
				bookmarkRecord.Set("tags", bookmarkBackup.Tags)

				userSettings, err := app.FindFirstRecordByFilter(
					"user_settings",
					"userId = {:userId}",
					dbx.Params{"userId": userId},
				)
				if err == nil && userSettings != nil {
					currentTagList := userSettings.GetStringSlice("tagList")
					updatedTagList := currentTagList

					for _, tag := range bookmarkBackup.Tags {
						found := false
						for _, existingTag := range currentTagList {
							if existingTag == tag {
								found = true
								break
							}
						}
						if !found {
							updatedTagList = append(updatedTagList, tag)
						}
					}

					if len(updatedTagList) > len(currentTagList) {
						userSettings.Set("tagList", updatedTagList)
						if err := app.Save(userSettings); err != nil {
							log.Printf("Error updating user_settings with new tags during restore: %v", err)
						}
					}
				}
			}

			// Set timestamp fields if they exist in backup data
			if bookmarkBackup.CreatedAt != "" {
				bookmarkRecord.Set("createdAt", bookmarkBackup.CreatedAt)
			}
			if bookmarkBackup.UpdatedAt != "" {
				bookmarkRecord.Set("updatedAt", bookmarkBackup.UpdatedAt)
			}

			if err := app.Save(bookmarkRecord); err != nil {
				log.Printf("Error saving bookmark %s: %v", bookmarkBackup.Title, err)
				continue
			}

			restoredBookmarks++
		}

		// 6. Restore user_settings
		// Check if UserSettings has any meaningful data (e.g. TagList is not nil, or a string field is not empty)
		if backupData.UserSettings.TagList != nil ||
			backupData.UserSettings.AccentColor != "" ||
			backupData.UserSettings.DefaultView != "" ||
			backupData.UserSettings.Language != "" {

			userSettingsRecord, errSettings := app.FindFirstRecordByFilter(
				"user_settings",
				"userId = {:userId}",
				dbx.Params{"userId": userId},
			)
			if errSettings != nil {
				log.Printf("WebDAV Restore: User settings not found for user %s. Cannot restore settings. Error: %v", userId, errSettings)
			} else if userSettingsRecord != nil {
				log.Printf("WebDAV Restore: Restoring user settings for user %s.", userId)

				if backupData.UserSettings.TagList != nil {
					userSettingsRecord.Set("tagList", backupData.UserSettings.TagList)
				}

				userSettingsRecord.Set("darkMode", backupData.UserSettings.DarkMode)

				if backupData.UserSettings.AccentColor != "" {
					userSettingsRecord.Set("accentColor", backupData.UserSettings.AccentColor)
				}
				if backupData.UserSettings.DefaultView != "" {
					userSettingsRecord.Set("defaultView", backupData.UserSettings.DefaultView)
				}
				if backupData.UserSettings.Language != "" {
					userSettingsRecord.Set("language", backupData.UserSettings.Language)
				}
				// Example for other potential settings:
				// if backupData.UserSettings.SortOption != "" { // Assuming SortOption is a string
				// 	userSettingsRecord.Set("sortOption", backupData.UserSettings.SortOption)
				// }
				// if backupData.UserSettings.SearchFields != nil { // Assuming SearchFields is []string
				// 	userSettingsRecord.Set("searchFields", backupData.UserSettings.SearchFields)
				// }

				if errSaveSettings := app.Save(userSettingsRecord); errSaveSettings != nil {
					log.Printf("WebDAV Restore: Failed to save updated user_settings for user %s: %v", userId, errSaveSettings)
				} else {
					log.Printf("WebDAV Restore: User settings successfully restored for user %s.", userId)
				}
			}
		} else {
			log.Printf("WebDAV Restore: No user settings data found in the backup for user %s, or settings were empty.", userId)
		}

		return e.JSON(http.StatusOK, map[string]interface{}{
			"success":            true,
			"message":            fmt.Sprintf("Restore successful from %s", downloadedFileName),
			"restored_bookmarks": restoredBookmarks,
			"restored_folders":   len(backupData.Folders),
		})
	}
}

// clearAllUserDataHandler handles the request to clear all data for the authenticated user.
func clearAllUserDataHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		var clearedBookmarksCount int = 0
		var clearedFoldersCount int = 0
		var tagsCleared bool = false
		var firstError error // To store the first error encountered in the transaction

		err := app.RunInTransaction(func(txApp core.App) error {
			// --- Clear Folders ---
			foldersToDelete := []*core.Record{} // Ensure this is core.Record
			folderCollection, err := txApp.FindCollectionByNameOrId("folders")
			if err != nil {
				firstError = fmt.Errorf("failed to find 'folders' collection: %w", err)
				return firstError
			}
			// Fetch records to delete
			// Ensure RecordQuery, AndWhere, NewExp, Params, and All are used as per docs for core.App context
			err = txApp.RecordQuery(folderCollection.Name).
				AndWhere(dbx.HashExp{"userId": userId}). // Changed to HashExp
				All(&foldersToDelete)
			if err != nil {
				firstError = fmt.Errorf("failed to fetch folders for user %s: %w", userId, err)
				return firstError
			}
			for _, folder := range foldersToDelete { // folder should be *core.Record
				if err := txApp.Delete(folder); err != nil { // txApp.Delete should accept *core.Record
					fmt.Printf("Error deleting folder %s for user %s: %v. Transaction will be rolled back.\n", folder.Id, userId, err)
					if firstError == nil {
						firstError = fmt.Errorf("failed to delete folder %s: %w", folder.Id, err)
					}
				} else {
					clearedFoldersCount++
				}
			}
			if firstError != nil {
				return firstError
			}

			// --- Clear Bookmarks ---
			bookmarksToDelete := []*core.Record{} // Ensure this is core.Record
			bookmarkCollection, err := txApp.FindCollectionByNameOrId("bookmarks")
			if err != nil {
				firstError = fmt.Errorf("failed to find 'bookmarks' collection: %w", err)
				return firstError
			}
			err = txApp.RecordQuery(bookmarkCollection.Name).
				AndWhere(dbx.HashExp{"userId": userId}). // Changed to HashExp
				All(&bookmarksToDelete)
			if err != nil {
				firstError = fmt.Errorf("failed to fetch bookmarks for user %s: %w", userId, err)
				return firstError
			}
			for _, bookmark := range bookmarksToDelete { // bookmark should be *core.Record
				if err := txApp.Delete(bookmark); err != nil { // txApp.Delete should accept *core.Record
					fmt.Printf("Error deleting bookmark %s for user %s: %v. Transaction will be rolled back.\n", bookmark.Id, userId, err)
					if firstError == nil {
						firstError = fmt.Errorf("failed to delete bookmark %s: %w", bookmark.Id, err)
					}
				} else {
					clearedBookmarksCount++
				}
			}
			if firstError != nil {
				return firstError
			}

			// --- Clear Tags from user_settings ---
			var userSettings *core.Record // Explicitly define as *core.Record
			userSettings, err = txApp.FindFirstRecordByFilter(
				"user_settings",
				"userId = {:userId}",
				dbx.Params{"userId": userId},
			)
			if err != nil {
				fmt.Printf("User settings not found for user %s, cannot clear tags from settings: %v. Continuing operation.\n", userId, err)
			} else if userSettings != nil {
				userSettings.Set("tagList", []string{})
				if err := txApp.Save(userSettings); err != nil { // txApp.Save should accept *core.Record
					fmt.Printf("Error clearing tagList for user %s: %v. Transaction will be rolled back.\n", userId, err)
					if firstError == nil {
						firstError = fmt.Errorf("failed to clear tagList for user %s: %w", userId, err)
					}
				} else {
					tagsCleared = true
				}
			}

			return firstError
		})

		if err != nil {
			return e.InternalServerError(fmt.Sprintf("Failed to clear user data: %v", err), nil)
		}

		return e.JSON(http.StatusOK, map[string]interface{}{
			"success":                 true,
			"message":                 "所有用户数据已成功清除。",
			"cleared_bookmarks_count": clearedBookmarksCount,
			"cleared_folders_count":   clearedFoldersCount,
			"tags_cleared":            tagsCleared,
		})
	}
}

// batchDeleteTagsHandler handles batch deleting tags from user_settings and associated bookmarks.
func batchDeleteTagsHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		var requestBody struct {
			Tags []string `json:"tags"`
		}
		if err := e.BindBody(&requestBody); err != nil {
			return e.BadRequestError("Failed to parse request data (expected 'tags' array).", err)
		}

		if len(requestBody.Tags) == 0 {
			return e.BadRequestError("Tags list cannot be empty.", nil)
		}

		tagsToDeleteMap := make(map[string]bool)
		for _, tag := range requestBody.Tags {
			trimmedTag := strings.TrimSpace(tag)
			if trimmedTag != "" {
				tagsToDeleteMap[trimmedTag] = true
			}
		}

		if len(tagsToDeleteMap) == 0 {
			return e.BadRequestError("No valid tags provided after processing input.", nil)
		}

		var actualDeletedGlobalTags []string

		err := app.RunInTransaction(func(txApp core.App) error {
			userSettings, err := txApp.FindFirstRecordByFilter(
				"user_settings",
				"userId = {:userId}",
				dbx.Params{"userId": userId},
			)
			if err != nil {
				return fmt.Errorf("failed to find user_settings for user %s: %w", userId, err)
			}

			currentGlobalTagList := userSettings.GetStringSlice("tagList")
			newGlobalTagList := []string{}

			for _, tag := range currentGlobalTagList {
				if !tagsToDeleteMap[tag] { // Keep tags not in the deletion list
					newGlobalTagList = append(newGlobalTagList, tag)
				} else {
					actualDeletedGlobalTags = append(actualDeletedGlobalTags, tag) // Track tags actually removed from global list
				}
			}

			// Only save if there was a change
			if len(actualDeletedGlobalTags) > 0 {
				userSettings.Set("tagList", newGlobalTagList)
				if err := txApp.Save(userSettings); err != nil {
					return fmt.Errorf("failed to save updated user_settings for user %s: %w", userId, err)
				}
				log.Printf("User %s batch deleted global tags: %v. New global tagList: %v. Updating bookmarks.", userId, actualDeletedGlobalTags, newGlobalTagList)

				// Now update bookmarks, removing only the tags that were actually deleted from the global list
				bookmarks, err := txApp.FindRecordsByFilter(
					"bookmarks",
					"userId = {:userId}",
					"", 0, 0,
					dbx.Params{"userId": userId},
				)
				if err != nil {
					// Log error but don't fail the transaction if bookmarks can't be found/updated,
					// as the primary goal (updating user_settings.tagList) is more critical.
					// The existing OnRecordUpdateRequest hook for user_settings might eventually catch up
					// or this can be handled by a separate reconciliation process if needed.
					log.Printf("Error finding bookmarks for user %s to update after batch tag deletion: %v. Global tags were updated.", userId, err)
					return nil // Or return err if strict consistency is required for bookmarks too.
				}

				for _, bookmark := range bookmarks {
					currentBookmarkTags := bookmark.GetStringSlice("tags")
					updatedBookmarkTags := []string{}
					bookmarkTagsChanged := false
					for _, bt := range currentBookmarkTags {
						isDeletedGlobalTag := false
						for _, dgt := range actualDeletedGlobalTags {
							if bt == dgt {
								isDeletedGlobalTag = true
								break
							}
						}
						if !isDeletedGlobalTag {
							updatedBookmarkTags = append(updatedBookmarkTags, bt)
						} else {
							bookmarkTagsChanged = true
						}
					}

					if bookmarkTagsChanged {
						bookmark.Set("tags", updatedBookmarkTags)
						if err := txApp.Save(bookmark); err != nil {
							log.Printf("Error saving updated tags for bookmark %s (user %s) after batch deletion: %v", bookmark.Id, userId, err)
							// Continue processing other bookmarks
						} else {
							log.Printf("Successfully removed batch deleted global tags from bookmark %s for user %s. New tags: %v", bookmark.Id, userId, updatedBookmarkTags)
						}
					}
				}
			} else {
				log.Printf("User %s attempted to batch delete tags, but none were found in the global list: %v", userId, requestBody.Tags)
			}
			return nil
		})

		if err != nil {
			return e.InternalServerError(fmt.Sprintf("Failed to batch delete tags: %v", err), nil)
		}

		if len(actualDeletedGlobalTags) > 0 {
			return e.JSON(http.StatusOK, map[string]interface{}{
				"success":                       true,
				"message":                       "Tags batch deleted successfully.",
				"deleted_tags_from_global_list": actualDeletedGlobalTags,
			})
		}
		return e.JSON(http.StatusOK, map[string]interface{}{
			"success":        true,
			"message":        "No tags were deleted as they were not found in the global list.",
			"attempted_tags": requestBody.Tags,
		})
	}
}

// addTagsBatchHandler handles batch adding tags to a bookmark.
func addTagsBatchHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		// a. Authentication protection
		authRecord := e.Auth
		if authRecord == nil {
			return apis.NewUnauthorizedError("User not authenticated.", nil)
		}
		userId := authRecord.Id

		// b. Get path parameter
		bookmarkId := e.Request.PathValue("bookmarkId")
		if bookmarkId == "" {
			return e.BadRequestError("Bookmark ID is required.", nil)
		}

		// c. Parse request body
		var requestBody struct {
			TagsInput string `json:"tagsInput"`
		}
		if err := e.BindBody(&requestBody); err != nil {
			return e.BadRequestError("Failed to parse request data (expected tagsInput string).", err)
		}
		if requestBody.TagsInput == "" {
			return e.BadRequestError("tagsInput cannot be empty.", nil)
		}

		// d. Get bookmark record
		bookmarkRecord, err := app.FindRecordById("bookmarks", bookmarkId)
		if err != nil {
			if strings.Contains(err.Error(), "no rows in result set") { // Check for specific error if possible, PocketBase might return a typed error
				return e.NotFoundError("Bookmark not found.", err)
			}
			return e.InternalServerError("Failed to fetch bookmark.", err)
		}

		// Check if the bookmark belongs to the current authenticated user
		if bookmarkRecord.GetString("userId") != userId {
			return e.ForbiddenError("You do not have permission to modify this bookmark.", nil)
		}

		// e. Process tag string
		// Replace semicolons with commas, then split by comma
		tagsStr := strings.ReplaceAll(requestBody.TagsInput, ";", ",")
		rawTags := strings.Split(tagsStr, ",")

		processedTags := []string{}
		for _, tag := range rawTags {
			trimmedTag := strings.TrimSpace(tag)
			if trimmedTag != "" {
				processedTags = append(processedTags, trimmedTag)
			}
		}

		if len(processedTags) == 0 {
			return e.BadRequestError("No valid tags provided after processing input.", nil)
		}

		// f. Merge tags
		existingTags := bookmarkRecord.GetStringSlice("tags")

		allTagsMap := make(map[string]bool)
		for _, tag := range existingTags {
			allTagsMap[strings.TrimSpace(tag)] = true // Ensure existing tags are also trimmed for consistent comparison
		}
		for _, tag := range processedTags { // processedTags are already trimmed
			allTagsMap[tag] = true
		}

		finalUniqueTagsArray := make([]string, 0, len(allTagsMap))
		for tag := range allTagsMap {
			finalUniqueTagsArray = append(finalUniqueTagsArray, tag)
		}
		// Optional: Sort finalUniqueTagsArray for consistency, though not strictly required by prompt
		// sort.Strings(finalUniqueTagsArray)

		// g. Update bookmark record
		bookmarkRecord.Set("tags", finalUniqueTagsArray)
		if err := app.Save(bookmarkRecord); err != nil {
			return e.InternalServerError("Failed to save bookmark with new tags.", err)
		}

		// h. Update global tagList in user_settings
		userSettings, err := app.FindFirstRecordByFilter(
			"user_settings",
			"userId = {:userId}",
			dbx.Params{"userId": userId},
		)
		if err != nil {
			log.Printf("Error finding user_settings for user %s to update tagList: %v. Proceeding without updating global list.", userId, err)
		} else if userSettings != nil {
			currentGlobalTags := userSettings.GetStringSlice("tagList")
			globalTagsMap := make(map[string]bool)
			for _, tag := range currentGlobalTags {
				globalTagsMap[strings.TrimSpace(tag)] = true // Trim for consistency
			}

			newTagsAddedToGlobalList := false
			for _, newOrUpdatedTag := range finalUniqueTagsArray { // Iterate through the tags now on the bookmark
				if _, exists := globalTagsMap[newOrUpdatedTag]; !exists {
					currentGlobalTags = append(currentGlobalTags, newOrUpdatedTag) // Add if it's new to the global list
					newTagsAddedToGlobalList = true
				}
			}

			if newTagsAddedToGlobalList {
				// Optional: Sort currentGlobalTags before saving for consistency
				// sort.Strings(currentGlobalTags)
				userSettings.Set("tagList", currentGlobalTags)
				if err := app.Save(userSettings); err != nil {
					log.Printf("Error saving user_settings for user %s after updating tagList: %v", userId, err)
					// Do not fail the whole request for this, but log it.
				}
			}
		}

		// i. Return response
		return e.JSON(http.StatusOK, bookmarkRecord)
	}
}

// PageData 存储网页内容和相关元数据
type PageData struct {
	Content         string `json:"content"`         // 页面主要文本内容
	MetaTitle       string `json:"metaTitle"`       // <title> 标签内容
	MetaDescription string `json:"metaDescription"` // <meta name="description"> 内容
	OGTitle         string `json:"ogTitle"`         // <meta property="og:title"> 内容
	OGDescription   string `json:"ogDescription"`   // <meta property="og:description"> 内容
}

// fetchPageContent 尝试获取给定URL的页面主要文本内容和元数据
func fetchPageContent(urlStr string, app *pocketbase.PocketBase) (PageData, error) {
	var pageData PageData
	var err error

	// 主要方法: 直接HTTP GET
	httpClient := &http.Client{Timeout: 20 * time.Second} // 增加超时到20秒
	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return pageData, fmt.Errorf("failed to create request for primary fetch: %w", err)
	}
	// 设置一个通用的User-Agent
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 MarkHubBookmarkProcessor/1.0")

	resp, err := httpClient.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("Error reading response body for %s: %v", urlStr, err)
		} else {
			// 使用字节切片创建新的io.Reader，以便多次使用
			bodyReader := bytes.NewReader(bodyBytes)
			doc, err := html.Parse(bodyReader)
			if err == nil {
				// 提取页面主要文本内容
				pageData.Content = extractTextFromHTML(doc)

				// 重置读取器位置并提取元数据
				bodyReader.Seek(0, 0)
				metaDoc, _ := html.Parse(bodyReader)
				extractMetadata(metaDoc, &pageData)

				if pageData.Content != "" {
					log.Printf("Successfully extracted content using primary method for URL: %s", urlStr)
					log.Printf("Extracted metadata: Title='%s', Description='%s', OG Title='%s', OG Description='%s'",
						pageData.MetaTitle, pageData.MetaDescription, pageData.OGTitle, pageData.OGDescription)
					return pageData, nil
				}
			}
			if err != nil {
				log.Printf("Error parsing HTML from primary fetch for %s: %v", urlStr, err)
			} else if pageData.Content == "" {
				log.Printf("Primary method extracted empty content for URL: %s", urlStr)
			}
		}
	} else {
		if err != nil {
			log.Printf("Primary fetch failed for URL %s: %v", urlStr, err)
		} else if resp != nil { // 检查resp是否为nil，防止空指针解引用
			log.Printf("Primary fetch failed for URL %s with status: %s", urlStr, resp.Status)
		} else {
			log.Printf("Primary fetch failed for URL %s with no response (err: %v)", urlStr, err)
		}
	}

	// 备用方法: 调用公益API
	log.Printf("Attempting fallback API for URL: %s", urlStr)
	encodedURL := url.QueryEscape(urlStr) // 正确编码整个URL
	fallbackApiUrl := fmt.Sprintf("https://api.pearktrue.cn/api/llmreader/?url=%s&type=json", encodedURL)

	fallbackReq, err := http.NewRequest("GET", fallbackApiUrl, nil)
	if err != nil {
		return pageData, fmt.Errorf("failed to create request for fallback API: %w", err)
	}
	fallbackReq.Header.Set("User-Agent", "MarkHubBookmarkProcessor/1.0")

	fallbackResp, err := httpClient.Do(fallbackReq)
	if err == nil && fallbackResp.StatusCode == http.StatusOK {
		defer fallbackResp.Body.Close()
		var fallbackResult struct {
			Code int    `json:"code"`
			Msg  string `json:"msg"`
			Data string `json:"data"`
			URL  string `json:"url"`
		}
		if err := json.NewDecoder(fallbackResp.Body).Decode(&fallbackResult); err == nil {
			if fallbackResult.Code == 200 && fallbackResult.Data != "" {
				log.Printf("Successfully extracted content using fallback API for URL: %s", urlStr)
				// 使用备用API获取的内容，但元数据将为空
				pageData.Content = fallbackResult.Data
				return pageData, nil
			}
			log.Printf("Fallback API for URL %s returned code %d or empty data. Msg: %s", urlStr, fallbackResult.Code, fallbackResult.Msg)
			return pageData, fmt.Errorf("fallback API failed with code %d: %s", fallbackResult.Code, fallbackResult.Msg)
		}
		if err != nil { // Renamed to avoid conflict
			log.Printf("Error decoding fallback API response for %s: %v", urlStr, err)
			return pageData, fmt.Errorf("failed to decode fallback API response: %w", err)
		}
	} else {
		if err != nil {
			log.Printf("Fallback API request failed for URL %s: %v", urlStr, err)
			return pageData, fmt.Errorf("fallback API request failed: %w", err)
		} else if fallbackResp != nil { // 检查fallbackResp是否为nil
			log.Printf("Fallback API request failed for URL %s with status: %s", urlStr, fallbackResp.Status)
			return pageData, fmt.Errorf("fallback API request failed with status %s", fallbackResp.Status)
		} else {
			log.Printf("Fallback API request failed for URL %s with no response (err: %v)", urlStr, err)
			return pageData, fmt.Errorf("fallback API request failed with no response")
		}
	}

	return pageData, fmt.Errorf("failed to fetch page content using all methods for URL: %s", urlStr)
}

// extractMetadata 从HTML文档中提取元数据
func extractMetadata(n *html.Node, pageData *PageData) {
	if n.Type == html.ElementNode {
		switch n.Data {
		case "title":
			// 提取 <title> 标签内容
			if n.FirstChild != nil {
				pageData.MetaTitle = strings.TrimSpace(n.FirstChild.Data)
			}
		case "meta":
			// 提取 <meta> 标签属性
			var name, property, content string
			for _, attr := range n.Attr {
				if attr.Key == "name" {
					name = attr.Val
				} else if attr.Key == "property" {
					property = attr.Val
				} else if attr.Key == "content" {
					content = attr.Val
				}
			}

			// 根据名称或属性赋值
			if name == "description" {
				pageData.MetaDescription = content
			} else if property == "og:title" {
				pageData.OGTitle = content
			} else if property == "og:description" {
				pageData.OGDescription = content
			}
		}
	}

	// 递归处理子节点
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		extractMetadata(c, pageData)
	}
}

// extractTextFromHTML 从HTML文档中提取并拼接所有可见文本内容
func extractTextFromHTML(n *html.Node) string {
	if n == nil {
		return ""
	}
	var buf bytes.Buffer
	var f func(*html.Node)
	f = func(n *html.Node) {
		if n.Type == html.TextNode {
			// 忽略脚本、样式和noscript标签内的文本
			parentNode := n.Parent
			if parentNode != nil && (parentNode.Type == html.ElementNode && (parentNode.Data == "script" || parentNode.Data == "style" || parentNode.Data == "noscript")) {
				return
			}
			trimmedData := strings.TrimSpace(n.Data)
			if trimmedData != "" {
				buf.WriteString(trimmedData)
				buf.WriteString(" ") // 添加空格以分隔文本块
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			f(c)
		}
	}
	f(n)
	return buf.String()
}

// getFaviconHandler handles the API request for fetching a favicon URL.
// API Endpoint: POST /api/custom/get-favicon
// Request Body: { "url": "string" }
// Response (Success): { "requested_url": "string", "favicon_url": "string | null" }
// Response (Error): Standard PocketBase error response
func getFaviconHandler(app *pocketbase.PocketBase) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			return e.UnauthorizedError("User not authenticated.", nil)
		}

		var requestData struct {
			URL string `json:"url"`
		}
		if err := e.BindBody(&requestData); err != nil {
			return e.BadRequestError("Failed to parse request data (expected 'url' string).", err)
		}

		requestedURL := strings.TrimSpace(requestData.URL)
		if requestedURL == "" {
			return e.BadRequestError("URL is required.", nil)
		}

		// Validate URL format
		_, err := url.ParseRequestURI(requestedURL)
		if err != nil {
			return e.BadRequestError("Invalid URL format provided.", err)
		}

		log.Printf("[GetFavicon] User %s: Requesting favicon for URL: %s", authRecord.Id, requestedURL)

		var faviconURL *string // Use pointer to allow null in JSON if not found
		httpClient := &http.Client{Timeout: 15 * time.Second}

		// Attempt 1: Google Favicon Service
		googleFaviconServiceURL := fmt.Sprintf("https://www.google.com/s2/favicons?sz=64&domain_url=%s", url.QueryEscape(requestedURL))
		log.Printf("[GetFavicon] User %s: Attempting Google for URL %s (%s)", authRecord.Id, requestedURL, googleFaviconServiceURL)

		fetchedGoogleURL, googleErr := fetchAndValidateFavicon(httpClient, googleFaviconServiceURL)
		if googleErr == nil && fetchedGoogleURL != "" {
			faviconURL = &fetchedGoogleURL // Assign address of fetchedGoogleURL
			log.Printf("[GetFavicon] User %s: Google success for URL %s. Favicon: %s", authRecord.Id, requestedURL, *faviconURL)
		} else {
			if googleErr != nil {
				log.Printf("[GetFavicon] User %s: Google error for URL %s: %v", authRecord.Id, requestedURL, googleErr)
			} else {
				log.Printf("[GetFavicon] User %s: Google returned invalid icon for URL %s", authRecord.Id, requestedURL)
			}

			// Attempt 2: DuckDuckGo Favicon Service (if Google failed)
			parsedRequestedURL, parseErr := url.Parse(requestedURL)
			if parseErr == nil && parsedRequestedURL.Hostname() != "" {
				hostname := parsedRequestedURL.Hostname()
				duckDuckGoServiceURL := fmt.Sprintf("https://icons.duckduckgo.com/ip3/%s.ico", hostname)
				log.Printf("[GetFavicon] User %s: Attempting DuckDuckGo for URL %s, hostname %s (%s)", authRecord.Id, requestedURL, hostname, duckDuckGoServiceURL)

				fetchedDuckDuckGoURL, ddgErr := fetchAndValidateFavicon(httpClient, duckDuckGoServiceURL)
				if ddgErr == nil && fetchedDuckDuckGoURL != "" {
					faviconURL = &fetchedDuckDuckGoURL // Assign address of fetchedDuckDuckGoURL
					log.Printf("[GetFavicon] User %s: DuckDuckGo success for URL %s. Favicon: %s", authRecord.Id, requestedURL, *faviconURL)
				} else {
					if ddgErr != nil {
						log.Printf("[GetFavicon] User %s: DuckDuckGo error for URL %s: %v", authRecord.Id, requestedURL, ddgErr)
					} else {
						log.Printf("[GetFavicon] User %s: DuckDuckGo returned invalid icon for URL %s, hostname %s", authRecord.Id, requestedURL, hostname)
					}
				}
			} else if parseErr != nil {
				log.Printf("[GetFavicon] User %s: Error parsing requested URL for DuckDuckGo (%s): %v", authRecord.Id, requestedURL, parseErr)
			}
		}

		// Log final decision
		if faviconURL != nil {
			log.Printf("[GetFavicon] User %s: Final favicon URL for %s is '%s'", authRecord.Id, requestedURL, *faviconURL)
		} else {
			log.Printf("[GetFavicon] User %s: No valid favicon found for %s after all attempts.", authRecord.Id, requestedURL)
		}

		return e.JSON(http.StatusOK, map[string]interface{}{
			"requested_url": requestedURL,
			"faviconUrl":    faviconURL, // Changed to camelCase
		})
	}
}

// fetchAndValidateFavicon attempts to fetch a favicon from a service URL and validates its content type and size.
// It returns the serviceURL itself if valid, or an error.
func fetchAndValidateFavicon(client *http.Client, serviceURL string) (string, error) {
	req, err := http.NewRequest("GET", serviceURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request for %s: %w", serviceURL, err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 MarkhubFaviconFetcher/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("HTTP request failed for %s: %w", serviceURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("bad status code from %s: %d", serviceURL, resp.StatusCode)
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	validContentTypes := []string{"image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon", "image/webp"}
	isContentTypeValid := false
	for _, validType := range validContentTypes {
		if strings.HasPrefix(contentType, validType) {
			isContentTypeValid = true
			break
		}
	}
	if !isContentTypeValid {
		return "", fmt.Errorf("invalid content type from %s: %s", serviceURL, contentType)
	}

	minContentLengthBytes := int64(100)
	contentLengthStr := resp.Header.Get("Content-Length")

	if contentLengthStr != "" {
		contentLength, parseErr := strconv.ParseInt(contentLengthStr, 10, 64)
		if parseErr == nil && contentLength > 0 && contentLength < minContentLengthBytes {
			return "", fmt.Errorf("content length too small from %s: %d bytes", serviceURL, contentLength)
		}
	} else {
		limitedReader := &io.LimitedReader{R: resp.Body, N: 2048}
		bodyBytes, readErr := io.ReadAll(limitedReader)
		if readErr != nil && readErr != io.EOF {
			return "", fmt.Errorf("failed to read response body from %s: %w", serviceURL, readErr)
		}
		if int64(len(bodyBytes)) < minContentLengthBytes {
			return "", fmt.Errorf("response body too small from %s: %d bytes read", serviceURL, len(bodyBytes))
		}
	}

	return serviceURL, nil
}

// clearAllUserDataHandler handles the request to clear all data for the authenticated user.
// This entire duplicated function block will be removed.

func main() {
	app := pocketbase.New()

	// It's crucial to bootstrap the application before accessing DAO or settings.
	// Bootstrap initializes the database connection, loads settings, etc.
	if err := app.Bootstrap(); err != nil {
		log.Fatalf("FATAL: Failed to bootstrap PocketBase application: %v\n", err)
	}
	log.Println("Info: PocketBase application bootstrapped successfully.")

	// --- Load configuration from environment variables and apply them AFTER bootstrap ---

	// 1. POCKETBASE_URL (HTTP Listen Address)
	pocketbaseUrlEnv := os.Getenv("POCKETBASE_URL")
	defaultPocketbaseAddr := "127.0.0.1:8090" // PocketBase's --http flag expects host:port
	pocketbaseAddr := defaultPocketbaseAddr

	if pocketbaseUrlEnv != "" {
		parsedUrl, err := url.Parse(pocketbaseUrlEnv)
		if err == nil && parsedUrl.Host != "" {
			pocketbaseAddr = parsedUrl.Host // Host includes hostname:port
			log.Printf("Info: Using POCKETBASE_URL from environment: %s (parsed as %s)\n", pocketbaseUrlEnv, pocketbaseAddr)
		} else {
			log.Printf("Warning: POCKETBASE_URL ('%s') is set but could not be parsed as a valid URL or does not contain a host. Using default: %s. Error: %v\n", pocketbaseUrlEnv, defaultPocketbaseAddr, err)
		}
	} else {
		log.Printf("Info: POCKETBASE_URL not set, using default PocketBase address: %s\n", defaultPocketbaseAddr)
	}

	// 2. JWT_SECRET
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret != "" && len(jwtSecret) < 32 {
		log.Printf("CRITICAL WARNING: JWT_SECRET from environment is too short (%d characters). It must be at least 32 characters long. Discarding and generating a new one or using default.", len(jwtSecret))
		jwtSecret = "" // Reset to trigger generation or default
	}

	if jwtSecret == "" {
		log.Println("Warning: JWT_SECRET environment variable not set or was too short.")
		randomKeyBytes := make([]byte, 32)                   // Generate a 32-byte (256-bit) key
		if _, err := rand.Read(randomKeyBytes); err == nil { // crypto/rand
			jwtSecret = hex.EncodeToString(randomKeyBytes) // encoding/hex (results in 64 hex chars)
			log.Printf("Info: Generated a temporary random JWT secret (64 hex chars): %s...\nIMPORTANT: For production, set a fixed, strong JWT_SECRET environment variable of at least 32 characters.\n", jwtSecret[:min(16, len(jwtSecret))])
		} else {
			// Fallback to a fixed, insecure key if random generation fails.
			// THIS IS CRITICAL TO CHANGE FOR PRODUCTION.
			jwtSecret = "DEV_ONLY_FIXED_WEAK_SECRET_CHANGE_ME_NOW_IMMEDIATELY_AND_SET_JWT_SECRET_ENV_VAR_MIN_32_CHARS_LONG" // Ensure this is long enough
			log.Printf("CRITICAL WARNING: Failed to generate random JWT secret: %v. Using a FIXED, WEAK, INSECURE development secret: %s...\nDO NOT USE THIS IN PRODUCTION. Set a strong JWT_SECRET environment variable of at least 32 characters.\n", err, jwtSecret[:min(16, len(jwtSecret))])
		}
	}

	// Configure JWT secret.
	// In PocketBase v0.20+, JWT secrets are usually part of collection auth options.
	// We'll try to set it for the "users" collection, and fallback to "_superusers".

	usersCollection, err := app.FindCollectionByNameOrId("users")
	if err == nil && usersCollection != nil && usersCollection.IsAuth() {
		// Set JWT secret using the confirmed path: collection.AuthToken.Secret
		usersCollection.AuthToken.Secret = jwtSecret
		// Attempt to save the collection using app.Save()
		if err := app.Save(usersCollection); err != nil {
			log.Printf("Warning: Failed to save 'users' collection after setting JWT secret: %v\n", err)
		} else {
			log.Println("Info: JWT Secret configured for 'users' collection.")
		}
	} else {
		if err != nil {
			log.Printf("Info: 'users' collection not found (%v), attempting to configure JWT for _superusers.", err)
		} else if usersCollection != nil && !usersCollection.IsAuth() {
			log.Printf("Info: 'users' collection is not an auth collection, attempting to configure JWT for _superusers.")
		} else if usersCollection == nil {
			log.Printf("Info: 'users' collection is nil, attempting to configure JWT for _superusers.")
		}

		superusersCollection, suErr := app.FindCollectionByNameOrId("_superusers")
		if suErr == nil && superusersCollection != nil && superusersCollection.IsAuth() {
			superusersCollection.AuthToken.Secret = jwtSecret
			if err := app.Save(superusersCollection); err != nil {
				log.Fatalf("FATAL: Failed to save '_superusers' collection after setting JWT secret: %v\n", err)
			} else {
				log.Println("Info: JWT Secret configured for '_superusers' collection.")
			}
		} else {
			if suErr != nil {
				log.Fatalf("FATAL: Failed to find '_superusers' collection to set JWT secret: %v\n", suErr)
			} else { // This case implies superusersCollection is nil or not an auth collection
				log.Fatalf("FATAL: '_superusers' collection is nil or not an auth collection. Cannot set JWT secret.\n")
			}
		}
	}
	log.Printf("Info: JWT Secret processing complete. Value starts with: %s...\n", jwtSecret[:min(8, len(jwtSecret))])
	// --- End of environment variable loading and initial configuration ---

	// Register migrations
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: true,
	})

	// --- Hooks for 'bookmarks' collection ---
	app.OnRecordCreateRequest("bookmarks").BindFunc(func(e *core.RecordRequestEvent) error {
		authRecord := e.Auth
		if authRecord != nil {
			e.Record.Set("userId", authRecord.Id)
		} else {
		}

		existingTags := e.Record.GetStringSlice("tags")
		if len(existingTags) > 0 && authRecord != nil {
			userSettings, err := e.App.FindFirstRecordByFilter(
				"user_settings",
				"userId = {:userId}",
				dbx.Params{"userId": authRecord.Id},
			)

			if err == nil && userSettings != nil {
				tagList := userSettings.GetStringSlice("tagList")

				newUniqueTags := make([]string, 0)
				for _, tag := range existingTags {
					isUnique := true
					for _, existingTag := range tagList {
						if existingTag == tag {
							isUnique = false
							break
						}
					}
					if isUnique {
						newUniqueTags = append(newUniqueTags, tag)
					}
				}

				if len(newUniqueTags) > 0 {
					updatedTagList := append(tagList, newUniqueTags...)
					userSettings.Set("tagList", updatedTagList)
					if err := e.App.Save(userSettings); err != nil {
						log.Printf("Error saving user_settings during bookmark create hook: %v", err)
					}
				}
			}
		}

		return e.Next()
	})

	app.OnRecordUpdateRequest("bookmarks").BindFunc(func(e *core.RecordRequestEvent) error {
		authRecord := e.Auth
		if authRecord != nil {
			e.Record.Set("userId", authRecord.Id)
		} else {
		}

		existingTags := e.Record.GetStringSlice("tags")
		if len(existingTags) > 0 && authRecord != nil {
			userSettings, err := e.App.FindFirstRecordByFilter(
				"user_settings",
				"userId = {:userId}",
				dbx.Params{"userId": authRecord.Id},
			)

			if err == nil && userSettings != nil {
				tagList := userSettings.GetStringSlice("tagList")

				newUniqueTags := make([]string, 0)
				for _, tag := range existingTags {
					isUnique := true
					for _, existingTag := range tagList {
						if existingTag == tag {
							isUnique = false
							break
						}
					}
					if isUnique {
						newUniqueTags = append(newUniqueTags, tag)
					}
				}

				if len(newUniqueTags) > 0 {
					updatedTagList := append(tagList, newUniqueTags...)
					userSettings.Set("tagList", updatedTagList)
					if err := e.App.Save(userSettings); err != nil {
						log.Printf("Error saving user_settings during bookmark update hook: %v", err)
					}
				}
			}
		}

		return e.Next()
	})

	// --- Hooks for 'folders' collection ---
	app.OnRecordCreateRequest("folders").BindFunc(func(e *core.RecordRequestEvent) error {
		authRecord := e.Auth
		if authRecord != nil {
			e.Record.Set("userId", authRecord.Id)
		} else {
			return apis.NewForbiddenError("Only authenticated users can create folders.", nil)
		}
		return e.Next()
	})

	app.OnRecordUpdateRequest("folders").BindFunc(func(e *core.RecordRequestEvent) error {
		authRecord := e.Auth
		if authRecord != nil {
			e.Record.Set("userId", authRecord.Id)
		} else {
			return apis.NewForbiddenError("Only authenticated users can update folders.", nil)
		}
		return e.Next()
	})
	// --- End of Hooks ---
	// --- Hook for 'user_settings' collection ---
	app.OnRecordUpdateRequest("user_settings").BindFunc(func(e *core.RecordRequestEvent) error {
		authRecord := e.Auth
		if authRecord == nil {
			// This should ideally not happen if collection rules are set correctly,
			// but as a safeguard:
			return apis.NewForbiddenError("Only authenticated users can update their settings.", nil)
		}
		userId := authRecord.Id

		// Get the current (old) state of the record
		oldRecord, err := e.App.FindRecordById("user_settings", e.Record.Id)
		if err != nil {
			log.Printf("Error finding old user_settings record %s for user %s: %v", e.Record.Id, userId, err)
			// Decide if this is a fatal error for the update operation.
			// For now, let's allow the update to proceed but log the issue.
			return e.Next()
		}

		oldTagList := oldRecord.GetStringSlice("tagList")
		newTagList := e.Record.GetStringSlice("tagList")

		// Find deleted tags
		deletedTags := []string{}
		oldTagsMap := make(map[string]bool)
		for _, tag := range oldTagList {
			oldTagsMap[tag] = true
		}

		for _, oldTag := range oldTagList {
			foundInNew := false
			for _, newTag := range newTagList {
				if oldTag == newTag {
					foundInNew = true
					break
				}
			}
			if !foundInNew {
				deletedTags = append(deletedTags, oldTag)
			}
		}

		if len(deletedTags) > 0 {
			log.Printf("User %s deleted tags: %v. Updating bookmarks.", userId, deletedTags)

			// Find all bookmarks for the user
			bookmarks, err := e.App.FindRecordsByFilter(
				"bookmarks",
				"userId = {:userId}",
				"", // sort
				0,  // limit
				0,  // offset
				dbx.Params{"userId": userId},
			)
			if err != nil {
				log.Printf("Error finding bookmarks for user %s to update tags: %v", userId, err)
				// Allow user_settings update to proceed, but log the failure to update bookmarks.
				return e.Next()
			}

			deletedTagsMap := make(map[string]bool)
			for _, tag := range deletedTags {
				deletedTagsMap[tag] = true
			}

			for _, bookmark := range bookmarks {
				currentBookmarkTags := bookmark.GetStringSlice("tags")
				updatedBookmarkTags := []string{}
				tagsChanged := false

				for _, tag := range currentBookmarkTags {
					if !deletedTagsMap[tag] {
						updatedBookmarkTags = append(updatedBookmarkTags, tag)
					} else {
						tagsChanged = true
					}
				}

				if tagsChanged {
					bookmark.Set("tags", updatedBookmarkTags)
					if err := e.App.Save(bookmark); err != nil {
						log.Printf("Error saving updated tags for bookmark %s (user %s): %v", bookmark.Id, userId, err)
						// Continue processing other bookmarks even if one fails.
					} else {
						log.Printf("Successfully removed deleted tags from bookmark %s for user %s. New tags: %v", bookmark.Id, userId, updatedBookmarkTags)
					}
				}
			}
		}

		return e.Next()
	})

	// Register all custom routes in a single OnServe handler to avoid conflicts
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Add debug logging to confirm route registration
		log.Println("Info: Registering custom API routes...")

		se.Router.POST(
			"/api/custom/suggest-folder",
			suggestFolderHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/ensure-folder-path",
			ensureFolderPathHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/webdav/backup",
			webdavBackupHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/webdav/restore",
			webdavRestoreHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/suggest-tags-for-bookmark",
			suggestTagsForBookmarkHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/bookmarks/{bookmarkId}/add-tags-batch",
			addTagsBatchHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/get-favicon",
			getFaviconHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/tags/batch-delete",
			batchDeleteTagsHandler(app),
		).Bind(apis.RequireAuth("users"))

		// The problematic route - ensure it's registered correctly
		se.Router.POST(
			"/api/custom/bookmarks/{bookmarkId}/ai-suggest-and-set-tags",
			aiSuggestAndSetTagsHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.POST(
			"/api/custom/user-data/clear-all",
			clearAllUserDataHandler(app),
		).Bind(apis.RequireAuth("users"))

		se.Router.GET(
			"/api/custom/sync/export-data",
			syncExportDataHandler(app),
		).Bind(apis.RequireAuth("users"))

		log.Println("Info: All custom API routes registered successfully, including sync export-data")
		return se.Next()
	})

	// --- Prepare arguments for the serve command ---
	serveArgs := []string{"serve"} // Default command is serve

	// Add --http flag if pocketbaseAddr was set from POCKETBASE_URL and is not the default
	if pocketbaseAddr != defaultPocketbaseAddr {
		serveArgs = append(serveArgs, "--http="+pocketbaseAddr)
		log.Printf("Info: Will start serve command with --http=%s\n", pocketbaseAddr)
	} else {
		log.Printf("Info: Will start serve command with default http address: %s\n", defaultPocketbaseAddr)
	}
	
	// You might want to pass other flags like --dev if needed, e.g.:
	// serveArgs = append(serveArgs, "--dev") // Or control this via another env var

	app.RootCmd.SetArgs(serveArgs)
	log.Printf("Info: PocketBase root command arguments set to: %v\n", serveArgs)

	if err := app.Start(); err != nil {
		log.Fatal(err)
		os.Exit(1)
	}
}

// Helper function for logging secrets safely
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
