package com.lnreader.plugins.chrysanthemumgarden

import com.rajarsheechatterjee.LNReader.plugins.Plugin
import com.rajarsheechatterjee.LNReader.plugins.PluginChapter
import com.rajarsheechatterjee.LNReader.plugins.PluginNovel
import com.rajarsheechatterjee.LNReader.plugins.PluginNovelDetails
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import java.io.IOException

class ChrysanthemumGarden : Plugin {
    override val id = "chrysanthemumgarden"
    override val name = "Chrysanthemum Garden"
    override val version = 1
    override val iconUrl = "https://chrysanthemumgarden.com/favicon.ico"
    override val site = "https://chrysanthemumgarden.com"
    override val language = "en"

    private val client = OkHttpClient()

    private fun fetchText(url: String): String {
        val request = Request.Builder().url(url).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Unexpected code $response")
            return response.body?.string() ?: ""
        }
    }

    override suspend fun popularNovels(page: Int, options: String?): List<PluginNovel> {
        val url = if (page == 1) "$site/books/" else "$site/books/page/$page/"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        return doc.select("article").mapNotNull { el ->
            if (el.select("div.series-genres > a").text().contains("Manhua")) return@mapNotNull null
            
            val titleEl = el.selectFirst("h2.novel-title > a")
            val name = titleEl?.text() ?: return@mapNotNull null
            val path = titleEl.attr("href").replace(site, "").trim('/')
            val cover = el.selectFirst("div.novel-cover > img")?.attr("data-breeze")
            
            PluginNovel(name, path, cover)
        }
    }

    override suspend fun searchNovels(query: String, page: Int): List<PluginNovel> {
        // CG search is client-side filtered from a full list
        // For efficiency in this native port, we'll fetch the JSON list
        val url = "$site/wp-json/melimeli/novels"
        val request = Request.Builder().url(url).build()
        val jsonString = client.newCall(request).execute().use { it.body?.string() ?: "[]" }
        
        // Simple JSON parsing (using Gson would be better but trying to keep it light/standard)
        // Or use the Gson dependency we saw in build.gradle
        val gson = com.google.gson.Gson()
        val novels = gson.fromJson(jsonString, Array<CGNovel>::class.java)
        
        return novels.filter { it.name.contains(query, ignoreCase = true) }
            .drop((page - 1) * 20)
            .take(20)
            .map { 
                PluginNovel(
                    it.name, 
                    it.link.replace(site, "").trim('/'), 
                    "https://github.com/LNReader/lnreader-sources/blob/main/src/en/chrysanthemumgarden/icon.png?raw=true" // Default cover
                ) 
            }
    }

    override suspend fun parseNovelDetails(novelUrl: String): PluginNovelDetails {
        val url = "$site/$novelUrl/"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        doc.select("h1.novel-title > span.novel-raw-title").remove()
        
        val name = doc.select("h1.novel-title").text()
        val cover = doc.select("div.novel-cover > img").attr("data-breeze")
        val summary = doc.select("div.entry-content").text()
        
        val authorHtml = doc.select("div.novel-info").html()
        val author = authorHtml.substringAfter("Author:").substringBefore("<br>").trim()
        
        val genres = (doc.select("div.series-genres > a").map { it.text() } + 
                     doc.select("a.series-tag").map { it.text().split("(")[0].trim() })
                     .joinToString(", ")

        val chapters = doc.select("div.chapter-item > a").map { el ->
            PluginChapter(
                el.text().trim(),
                el.attr("href").replace(site, "").trim('/'),
                null,
                null
            )
        }

        return PluginNovelDetails(
            name = name,
            url = novelUrl,
            coverUrl = cover,
            author = author,
            artist = null,
            description = summary,
            genre = genres,
            status = null, // Status parsing logic can be added
            chapters = chapters
        )
    }

    override suspend fun parseChapter(chapterUrl: String): String {
        val url = "$site/$chapterUrl/"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        return doc.select("div#novel-content").html()
    }

    override fun getImageHeaders(): Headers? = null

    private data class CGNovel(val name: String, val link: String)
}
