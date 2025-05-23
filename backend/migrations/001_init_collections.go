package migrations

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// --- user_settings collection (Stage 1) ---
		userSettingsCollection := core.NewBaseCollection("user_settings")
		userSettingsCollection.Name = "user_settings"
		userSettingsCollection.ListRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		userSettingsCollection.ViewRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		userSettingsCollection.CreateRule = types.Pointer("@request.auth.id != \"\"")
		userSettingsCollection.UpdateRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		userSettingsCollection.DeleteRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")

		userSettingsCollection.Fields.Add(&core.RelationField{
			Name:          "userId",
			Required:      true,
			System:        false,
			CollectionId:  "_pb_users_auth_",
			CascadeDelete: true,
			MinSelect:     1,
			MaxSelect:     1,
		})
		userSettingsCollection.Fields.Add(&core.BoolField{Name: "darkMode"})
		userSettingsCollection.Fields.Add(&core.TextField{Name: "accentColor"})
		userSettingsCollection.Fields.Add(&core.TextField{Name: "defaultView"})
		userSettingsCollection.Fields.Add(&core.TextField{Name: "language"})
		userSettingsCollection.Fields.Add(&core.TextField{Name: "geminiApiKey"})
		userSettingsCollection.Fields.Add(&core.TextField{Name: "geminiApiBaseUrl"})
		userSettingsCollection.Fields.Add(&core.TextField{Name: "geminiModelName"})
		userSettingsCollection.Fields.Add(&core.JSONField{Name: "webdav_config"})
		userSettingsCollection.Fields.Add(&core.JSONField{Name: "favoriteFolderIds"})
		userSettingsCollection.Fields.Add(&core.JSONField{Name: "tagList"})
		userSettingsCollection.Fields.Add(&core.TextField{Name: "sortOption"})
		userSettingsCollection.Fields.Add(&core.JSONField{Name: "searchFields"})
		// Add timestamp fields
		userSettingsCollection.Fields.Add(&core.AutodateField{
			Name:     "createdAt",
			OnCreate: true,
			OnUpdate: false,
		})
		userSettingsCollection.Fields.Add(&core.AutodateField{
			Name:     "updatedAt",
			OnCreate: true,
			OnUpdate: true,
		})
		userSettingsCollection.Indexes = []string{
			"CREATE UNIQUE INDEX idx_user_settings_userId ON {{user_settings}} (userId)",
		}
		if err := app.Save(userSettingsCollection); err != nil {
			return fmt.Errorf("failed to create user_settings collection: %w", err)
		}

		// --- folders collection (Stage 1: Create without parentId) ---
		foldersCollection := core.NewBaseCollection("folders")
		foldersCollection.Name = "folders"
		foldersCollection.ListRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		foldersCollection.ViewRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		foldersCollection.CreateRule = types.Pointer("@request.auth.id != \"\"")
		foldersCollection.UpdateRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		foldersCollection.DeleteRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")

		foldersCollection.Fields.Add(&core.RelationField{
			Name:          "userId",
			Required:      true,
			CollectionId:  "_pb_users_auth_",
			CascadeDelete: false,
			MinSelect:     1,
			MaxSelect:     1,
		})
		foldersCollection.Fields.Add(&core.TextField{
			Name:     "name",
			Required: true,
		})
		foldersCollection.Fields.Add(&core.TextField{
			Name: "chromeParentId",
		})
		// Add timestamp fields
		foldersCollection.Fields.Add(&core.AutodateField{
			Name:     "createdAt",
			OnCreate: true,
			OnUpdate: false,
		})
		foldersCollection.Fields.Add(&core.AutodateField{
			Name:     "updatedAt",
			OnCreate: true,
			OnUpdate: true,
		})
		if err := app.Save(foldersCollection); err != nil {
			// Attempt to clean up user_settings if folders creation fails
			if col, _ := app.FindCollectionByNameOrId("user_settings"); col != nil {
				_ = app.Delete(col)
			}
			return fmt.Errorf("failed to create folders collection (stage 1): %w", err)
		}

		// --- bookmarks collection (Stage 1: Create without folderId) ---
		bookmarksCollection := core.NewBaseCollection("bookmarks")
		bookmarksCollection.Name = "bookmarks"
		bookmarksCollection.ListRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		bookmarksCollection.ViewRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		bookmarksCollection.CreateRule = types.Pointer("@request.auth.id != \"\"")
		bookmarksCollection.UpdateRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")
		bookmarksCollection.DeleteRule = types.Pointer("@request.auth.id != \"\" && @request.auth.id = userId")

		bookmarksCollection.Fields.Add(&core.RelationField{
			Name:          "userId",
			Required:      true,
			CollectionId:  "_pb_users_auth_",
			CascadeDelete: false,
			MinSelect:     1,
			MaxSelect:     1,
		})
		bookmarksCollection.Fields.Add(&core.TextField{
			Name:     "title",
			Required: true,
		})
		bookmarksCollection.Fields.Add(&core.URLField{
			Name:     "url",
			Required: true,
		})
		bookmarksCollection.Fields.Add(&core.JSONField{
			Name: "tags",
		})
		// Remove the original 'favicon' (URLField) - already commented, now ensuring it's not added
		bookmarksCollection.Fields.Add(&core.TextField{ // Add the final 'faviconUrl' (TextField)
			Name:     "faviconUrl",
			Required: false,
			System:   false,
		})
		bookmarksCollection.Fields.Add(&core.BoolField{
			Name: "isFavorite",
		})
		bookmarksCollection.Fields.Add(&core.TextField{
			Name: "chromeBookmarkId",
		})
		// Add timestamp fields
		bookmarksCollection.Fields.Add(&core.AutodateField{
			Name:     "createdAt",
			OnCreate: true,
			OnUpdate: false,
		})
		bookmarksCollection.Fields.Add(&core.AutodateField{
			Name:     "updatedAt",
			OnCreate: true,
			OnUpdate: true,
		})
		if err := app.Save(bookmarksCollection); err != nil {
			// Attempt to clean up previous collections if bookmarks creation fails
			if col, _ := app.FindCollectionByNameOrId("folders"); col != nil {
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("user_settings"); col != nil {
				_ = app.Delete(col)
			}
			return fmt.Errorf("failed to create bookmarks collection (stage 1): %w", err)
		}

		// --- folders collection (Stage 2: Add parentId) ---
		fetchedFoldersCollection, err := app.FindCollectionByNameOrId("folders")
		if err != nil {
			// Attempt to clean up previous collections if find fails
			if col, _ := app.FindCollectionByNameOrId("bookmarks"); col != nil {
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("folders"); col != nil { // Should not exist if find failed, but good practice
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("user_settings"); col != nil {
				_ = app.Delete(col)
			}
			return fmt.Errorf("failed to find folders collection for stage 2: %w", err)
		}
		parentIdField := &core.RelationField{
			Name:          "parentId",
			CollectionId:  fetchedFoldersCollection.Id, // Self-relation
			CascadeDelete: false,
			MaxSelect:     1,
			Required:      false,
		}
		fetchedFoldersCollection.Fields.Add(parentIdField)
		if err := app.Save(fetchedFoldersCollection); err != nil {
			// Attempt to clean up all collections if adding parentId fails
			// Note: bookmarks might not have folderId yet, but folders (stage 1) and user_settings exist.
			if col, _ := app.FindCollectionByNameOrId("bookmarks"); col != nil {
				_ = app.Delete(col)
			}
			// Re-fetch folders to delete the version that might have been partially saved or the original one
			if col, findErr := app.FindCollectionByNameOrId("folders"); findErr == nil && col != nil {
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("user_settings"); col != nil {
				_ = app.Delete(col)
			}
			return fmt.Errorf("failed to add parentId to folders collection (stage 2): %w", err)
		}

		// --- bookmarks collection (Stage 2: Add folderId) ---
		fetchedBookmarksCollection, err := app.FindCollectionByNameOrId("bookmarks")
		if err != nil {
			// Attempt to clean up all collections if find fails
			// folders collection now includes parentId
			if col, _ := app.FindCollectionByNameOrId("bookmarks"); col != nil { // Should not exist if find failed
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("folders"); col != nil {
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("user_settings"); col != nil {
				_ = app.Delete(col)
			}
			return fmt.Errorf("failed to find bookmarks collection for stage 2: %w", err)
		}
		folderIdField := &core.RelationField{
			Name:          "folderId",
			CollectionId:  fetchedFoldersCollection.Id, // Use ID of the now fully defined folders collection
			CascadeDelete: false,
			MaxSelect:     1,
			Required:      false,
		}
		fetchedBookmarksCollection.Fields.Add(folderIdField)
		if err := app.Save(fetchedBookmarksCollection); err != nil {
			// Attempt to clean up all collections if adding folderId fails
			if col, findErr := app.FindCollectionByNameOrId("bookmarks"); findErr == nil && col != nil {
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("folders"); col != nil {
				_ = app.Delete(col)
			}
			if col, _ := app.FindCollectionByNameOrId("user_settings"); col != nil {
				_ = app.Delete(col)
			}
			return fmt.Errorf("failed to add folderId to bookmarks collection (stage 2): %w", err)
		}

		return nil
	}, func(app core.App) error {
		// --- Down migration ---
		// Delete in reverse order of creation, considering dependencies.
		// bookmarks depends on folders. folders has a self-dependency. user_settings is independent of these two.
		// It's generally safer to delete collections that are depended upon last.
		// So, bookmarks -> folders -> user_settings
		collectionNames := []string{"bookmarks", "folders", "user_settings"}

		for _, name := range collectionNames {
			collection, _ := app.FindCollectionByNameOrId(name)
			if collection != nil {
				if err := app.Delete(collection); err != nil {
					return fmt.Errorf("failed to delete collection %s: %w", name, err)
				}
			}
		}
		return nil
	})
}