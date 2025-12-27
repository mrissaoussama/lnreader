package com.rajarsheechatterjee.LNReader.plugins

import okhttp3.Headers

interface Plugin {
    val id: String
    val name: String
    val version: Int
    val iconUrl: String?
    val site: String
    val language: String

    // Core functionality
    suspend fun searchNovels(query: String, page: Int): List<PluginNovel>
    suspend fun popularNovels(page: Int, options: String?): List<PluginNovel>
    suspend fun parseNovelDetails(novelUrl: String): PluginNovelDetails
    suspend fun parseChapter(chapterUrl: String): String // Returns HTML content
    
    // Image handling
    fun getImageHeaders(): Headers?
}

data class PluginNovel(
    val name: String,
    val url: String,
    val coverUrl: String?
)

data class PluginNovelDetails(
    val name: String,
    val url: String,
    val coverUrl: String?,
    val author: String?,
    val artist: String?,
    val description: String?,
    val genre: String?,
    val status: String?,
    val chapters: List<PluginChapter>
)

data class PluginChapter(
    val name: String,
    val url: String,
    val releaseDate: String?,
    val chapterNumber: String?
)
