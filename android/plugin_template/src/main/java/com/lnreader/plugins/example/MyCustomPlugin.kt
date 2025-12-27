package com.lnreader.plugins.example

import com.rajarsheechatterjee.LNReader.plugins.Plugin
import com.rajarsheechatterjee.LNReader.plugins.PluginChapter
import com.rajarsheechatterjee.LNReader.plugins.PluginNovel
import com.rajarsheechatterjee.LNReader.plugins.PluginNovelDetails
import okhttp3.Headers

class MyCustomPlugin : Plugin {
    override val id = "my_custom_plugin"
    override val name = "My Custom Plugin"
    override val version = 1
    override val iconUrl: String? = null
    override val site = "https://example.com"
    override val language = "en"

    override suspend fun searchNovels(query: String, page: Int): List<PluginNovel> {
        return listOf(
            PluginNovel("Custom Novel 1", "/novel/1", null)
        )
    }

    override suspend fun popularNovels(page: Int, options: String?): List<PluginNovel> {
        return searchNovels("", page)
    }

    override suspend fun parseNovelDetails(novelUrl: String): PluginNovelDetails {
        return PluginNovelDetails(
            name = "Custom Novel 1",
            url = novelUrl,
            coverUrl = null,
            author = "Custom Author",
            artist = "Custom Artist",
            description = "Description from custom plugin",
            genre = "Fantasy",
            status = "Ongoing",
            chapters = listOf(
                PluginChapter("Chapter 1", "/novel/1/chapter/1", "2023-01-01", "1")
            )
        )
    }

    override suspend fun parseChapter(chapterUrl: String): String {
        return "<h1>Chapter 1</h1><p>This content comes from the external APK plugin!</p>"
    }

    override fun getImageHeaders(): Headers? {
        return null
    }
}

