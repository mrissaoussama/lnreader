package com.lnreader.plugins.fictionzone

import com.rajarsheechatterjee.LNReader.plugins.Plugin
import com.rajarsheechatterjee.LNReader.plugins.PluginChapter
import com.rajarsheechatterjee.LNReader.plugins.PluginNovel
import com.rajarsheechatterjee.LNReader.plugins.PluginNovelDetails
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jsoup.Jsoup
import java.io.IOException
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser

class FictionZone : Plugin {
    override val id = "fictionzone"
    override val name = "Fiction Zone"
    override val version = 1
    override val iconUrl = "https://raw.githubusercontent.com/mrissaoussama/lnreader-plugins/plugins/v3.0.0/public/static/src/en/fictionzone/icon.png"
    override val site = "https://fictionzone.net"
    override val language = "en"

    private val client = OkHttpClient()
    private val gson = Gson()

    private fun fetchText(url: String): String {
        val request = Request.Builder().url(url).build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Unexpected code $response")
            return response.body?.string() ?: ""
        }
    }

    private fun fetchJson(url: String, method: String = "GET", body: String? = null): JsonObject {
        val requestBuilder = Request.Builder().url(url)
        if (method == "POST" && body != null) {
            requestBuilder.post(body.toRequestBody("application/json".toMediaType()))
        }
        val request = requestBuilder.build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Unexpected code $response")
            val responseBody = response.body?.string() ?: "{}"
            return JsonParser.parseString(responseBody).asJsonObject
        }
    }

    override suspend fun popularNovels(page: Int, options: String?): List<PluginNovel> {
        val url = "$site/library?page=$page"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        return doc.select("div.novel-card").mapNotNull { el ->
            val titleEl = el.selectFirst("a > div.title > h1")
            val name = titleEl?.text() ?: return@mapNotNull null
            val cover = el.selectFirst("img")?.attr("src")
            val path = el.selectFirst("a")?.attr("href")?.trim('/') ?: return@mapNotNull null
            
            PluginNovel(name, path, cover)
        }
    }

    override suspend fun searchNovels(query: String, page: Int): List<PluginNovel> {
        val url = "$site/library?query=${java.net.URLEncoder.encode(query, "UTF-8")}&page=$page&sort=views-all"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        return doc.select("div.novel-card").mapNotNull { el ->
            val titleEl = el.selectFirst("a > div.title > h1")
            val name = titleEl?.text() ?: return@mapNotNull null
            val cover = el.selectFirst("img")?.attr("src")
            val path = el.selectFirst("a")?.attr("href")?.trim('/') ?: return@mapNotNull null
            
            PluginNovel(name, path, cover)
        }
    }

    override suspend fun parseNovelDetails(novelUrl: String): PluginNovelDetails {
        val url = "$site/$novelUrl"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        val name = doc.select("div.novel-title > h1").text()
        val author = doc.select("div.novel-author > content").text()
        val cover = doc.select("div.novel-img > img").attr("src")
        val summary = doc.select("#synopsis > div.content").text()
        
        val genres = (doc.select("div.genres > .items > span").map { it.text() } + 
                     doc.select("div.tags > .items > a").map { it.text() })
                     .joinToString(", ")
                     
        val statusText = doc.select("div.novel-status > div.content").text().trim()
        val status = when(statusText) {
            "Ongoing" -> "Ongoing"
            "Completed" -> "Completed"
            else -> "Unknown"
        }

        // Extract Novel ID from Nuxt data
        var novelId: String? = null
        val nuxtData = doc.select("script#__NUXT_DATA__").html()
        if (nuxtData.isNotEmpty()) {
            try {
                val jsonArray = JsonParser.parseString(nuxtData).asJsonArray
                for (element in jsonArray) {
                    if (element.isJsonObject) {
                        val obj = element.asJsonObject
                        if (obj.has("novel") && obj.get("novel").isJsonObject) {
                            val novelObj = obj.getAsJsonObject("novel")
                            if (novelObj.has("id")) {
                                novelId = novelObj.get("id").asString
                                break
                            }
                        }
                    }
                }
                // Fallback search if structure is different (simplified)
                if (novelId == null) {
                     // This part is tricky without exact structure matching, 
                     // but the JS plugin iterates to find an object with novel.id
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        val chapters = mutableListOf<PluginChapter>()
        
        if (novelId != null) {
            try {
                chapters.addAll(fetchAllChapters(novelId, novelUrl))
            } catch (e: Exception) {
                // Fallback to HTML parsing
            }
        }
        
        if (chapters.isEmpty()) {
             doc.select("div.chapters > div.list-wrapper > div.items > a.chapter").forEach { el ->
                val chapterName = el.select("span.chapter-title").text()
                val chapterUrl = el.attr("href").trim('/')
                val releaseDate = el.select("span.update-date").text()
                if (chapterUrl.isNotEmpty()) {
                    chapters.add(PluginChapter(chapterName, chapterUrl, releaseDate, null))
                }
            }
        }

        return PluginNovelDetails(
            name = name,
            url = novelUrl,
            coverUrl = cover,
            author = author,
            artist = null,
            description = summary,
            genre = genres,
            status = status,
            chapters = chapters
        )
    }
    
    private fun fetchAllChapters(novelId: String, novelPath: String): List<PluginChapter> {
        val allChapters = mutableListOf<PluginChapter>()
        var currentPage = 1
        var lastPage = 1
        
        do {
            val jsonBody = """
                {
                    "path": "/chapter/all/$novelId",
                    "query": { "page": $currentPage },
                    "headers": { "content-type": "application/json" },
                    "method": "get"
                }
            """.trimIndent()
            
            val response = fetchJson("$site/api/__api_party/api-v1", "POST", jsonBody)
            
            if (response.has("_success") && response.get("_success").asBoolean) {
                val data = response.getAsJsonArray("_data")
                data.forEach { 
                    val c = it.asJsonObject
                    val name = c.get("title").asString
                    val slug = c.get("slug").asString
                    val date = c.get("created_at").asString
                    allChapters.add(PluginChapter(name, "$novelPath/$slug", date, null))
                }
                
                if (response.has("_extra")) {
                    val extra = response.getAsJsonObject("_extra")
                    if (extra.has("_pagination")) {
                        val pagination = extra.getAsJsonObject("_pagination")
                        if (pagination.has("_last")) {
                            lastPage = pagination.get("_last").asInt
                        }
                    }
                }
            } else {
                break
            }
            currentPage++
        } while (currentPage <= lastPage)
        
        return allChapters
    }

    override suspend fun parseChapter(chapterUrl: String): String {
        val url = "$site/$chapterUrl"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        return doc.select("div.chapter-content").html()
    }

    override fun getImageHeaders(): Headers? = null
}
