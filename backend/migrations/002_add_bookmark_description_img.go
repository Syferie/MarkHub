package migrations

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		// 获取现有的 bookmarks 集合
		bookmarksCollection, err := app.FindCollectionByNameOrId("bookmarks")
		if err != nil {
			return fmt.Errorf("failed to find bookmarks collection: %w", err)
		}

		// 添加 description 字段 (TEXT, 可为空)
		descriptionField := &core.TextField{
			Name:     "description",
			Required: false,
			System:   false,
		}
		bookmarksCollection.Fields.Add(descriptionField)

		// 添加 img 字段 (TEXT, 可为空) - 用于存储图片 URL 或路径
		imgField := &core.TextField{
			Name:     "img",
			Required: false,
			System:   false,
		}
		bookmarksCollection.Fields.Add(imgField)

		// 保存更新后的集合
		if err := app.Save(bookmarksCollection); err != nil {
			return fmt.Errorf("failed to add description and img fields to bookmarks collection: %w", err)
		}

		return nil
	}, func(app core.App) error {
		// --- Down migration ---
		// 获取 bookmarks 集合
		bookmarksCollection, err := app.FindCollectionByNameOrId("bookmarks")
		if err != nil {
			return fmt.Errorf("failed to find bookmarks collection for rollback: %w", err)
		}

		// 移除 description 字段
		for i, field := range bookmarksCollection.Fields {
			if field.GetName() == "description" {
				bookmarksCollection.Fields = append(bookmarksCollection.Fields[:i], bookmarksCollection.Fields[i+1:]...)
				break
			}
		}

		// 移除 img 字段
		for i, field := range bookmarksCollection.Fields {
			if field.GetName() == "img" {
				bookmarksCollection.Fields = append(bookmarksCollection.Fields[:i], bookmarksCollection.Fields[i+1:]...)
				break
			}
		}

		// 保存更新后的集合
		if err := app.Save(bookmarksCollection); err != nil {
			return fmt.Errorf("failed to remove description and img fields from bookmarks collection: %w", err)
		}

		return nil
	})
}