package com.lnreader.plugins.wtrlab

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
import com.google.gson.JsonArray
import java.net.URLEncoder

class WtrLab : Plugin {
    override val id = "WTRLAB"
    override val name = "WTR-LAB"
    override val version = 1
    override val iconUrl = "https://raw.githubusercontent.com/mrissaoussama/lnreader-plugins/plugins/v3.0.0/public/static/src/en/wtrlab/icon.png"
    override val site = "https://wtr-lab.com/"
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
        // Simplified implementation: always fetch latest for now, or parse options if needed
        // The JS plugin has complex filter logic. For now, let's implement "Latest" (showLatestNovels=true)
        // and "Popular" (default)
        
        // Check if options contains "showLatestNovels": true
        val showLatest = options?.contains("\"showLatestNovels\":true") == true
        
        if (showLatest) {
            val url = "${site}api/home/recent"
            val body = """{"page":$page}"""
            val response = fetchJson(url, "POST", body)
            
            if (response.has("data")) {
                val data = response.getAsJsonArray("data")
                return data.mapNotNull { 
                    val datum = it.asJsonObject
                    val serie = datum.getAsJsonObject("serie")
                    val serieData = serie.getAsJsonObject("data")
                    
                    val name = serieData.get("title").asString
                    val cover = serieData.get("image").asString
                    val rawId = serie.get("raw_id").asInt
                    val slug = serie.get("slug").asString
                    val path = "en/serie-$rawId/$slug"
                    
                    PluginNovel(name, path, cover)
                }
            }
            return emptyList()
        } else {
            // For search/popular, we need buildId
            // First fetch novel-finder page to get buildId
            val finderUrl = "${site}en/novel-finder"
            val finderHtml = fetchText(finderUrl)
            val doc = Jsoup.parse(finderHtml)
            val nextData = doc.select("#__NEXT_DATA__").html()
            val buildId = JsonParser.parseString(nextData).asJsonObject.get("buildId").asString
            
            // Construct URL
            // Default params for popular/search
            val params = "orderBy=update&order=desc&status=all&release_status=all&addition_age=all&page=$page"
            val url = "${site}_next/data/$buildId/en/novel-finder.json?$params"
            
            val response = fetchJson(url)
            val series = response.getAsJsonObject("pageProps").getAsJsonArray("series")
            
            val seenIds = mutableSetOf<Int>()
            return series.mapNotNull { 
                val novel = it.asJsonObject
                val rawId = novel.get("raw_id").asInt
                if (seenIds.contains(rawId)) return@mapNotNull null
                seenIds.add(rawId)
                
                val data = novel.getAsJsonObject("data")
                val name = data.get("title").asString
                val cover = data.get("image").asString
                val slug = novel.get("slug").asString
                val path = "en/serie-$rawId/$slug"
                
                PluginNovel(name, path, cover)
            }
        }
    }

    override suspend fun searchNovels(query: String, page: Int): List<PluginNovel> {
        // Similar to popularNovels but with search param
        val finderUrl = "${site}en/novel-finder"
        val finderHtml = fetchText(finderUrl)
        val doc = Jsoup.parse(finderHtml)
        val nextData = doc.select("#__NEXT_DATA__").html()
        val buildId = JsonParser.parseString(nextData).asJsonObject.get("buildId").asString
        
        val encodedQuery = URLEncoder.encode(query, "UTF-8")
        val params = "orderBy=update&order=desc&status=all&release_status=all&addition_age=all&page=$page&text=$encodedQuery"
        val url = "${site}_next/data/$buildId/en/novel-finder.json?$params"
        
        val response = fetchJson(url)
        val series = response.getAsJsonObject("pageProps").getAsJsonArray("series")
        
        val seenIds = mutableSetOf<Int>()
        return series.mapNotNull { 
            val novel = it.asJsonObject
            val rawId = novel.get("raw_id").asInt
            if (seenIds.contains(rawId)) return@mapNotNull null
            seenIds.add(rawId)
            
            val data = novel.getAsJsonObject("data")
            val name = data.get("title").asString
            val cover = data.get("image").asString
            val slug = novel.get("slug").asString
            val path = "en/serie-$rawId/$slug"
            
            PluginNovel(name, path, cover)
        }
    }

    override suspend fun parseNovelDetails(novelUrl: String): PluginNovelDetails {
        val url = "$site$novelUrl"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        val nextData = doc.select("#__NEXT_DATA__").html()
        val jsonData = JsonParser.parseString(nextData).asJsonObject
        val serieData = jsonData.getAsJsonObject("props").getAsJsonObject("pageProps").getAsJsonObject("serie").getAsJsonObject("serie_data")
        val data = serieData.getAsJsonObject("data")
        
        val name = data.get("title").asString
        val cover = data.get("image").asString
        val summary = data.get("description").asString
        val author = data.get("author").asString
        
        val statusInt = serieData.get("status").asInt
        val status = when(statusInt) {
            0 -> "Ongoing"
            1 -> "Completed"
            else -> "Unknown"
        }
        
        // Genres extraction from HTML as fallback or if not in JSON
        // The JS plugin extracts from HTML mostly
        val genres = doc.select(".genre").map { it.text().trim() }.joinToString(", ")
        
        // Chapters
        val rawId = serieData.get("id").asInt
        val slug = serieData.get("slug").asString
        val chapterCount = serieData.get("chapter_count").asInt
        
        val chapters = fetchAllChapters(rawId, chapterCount, slug)
        
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
    
    private fun fetchAllChapters(rawId: Int, totalChapters: Int, slug: String): List<PluginChapter> {
        val allChapters = mutableListOf<PluginChapter>()
        val batchSize = 250
        
        for (start in 1..totalChapters step batchSize) {
            val end = minOf(start + batchSize - 1, totalChapters)
            val url = "${site}api/chapters/$rawId?start=$start&end=$end"
            
            try {
                val response = fetchJson(url)
                if (response.has("chapters")) {
                    val chaptersArray = response.getAsJsonArray("chapters")
                    chaptersArray.forEach { 
                        val c = it.asJsonObject
                        val title = c.get("title").asString
                        val order = c.get("order").asInt
                        val date = if (c.has("updated_at") && !c.get("updated_at").isJsonNull) c.get("updated_at").asString.substring(0, 10) else ""
                        val path = "en/serie-$rawId/$slug/chapter-$order"
                        
                        allChapters.add(PluginChapter(title, path, date, null))
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        return allChapters
    }
    
    private fun minOf(a: Int, b: Int): Int {
        return if (a <= b) a else b
    }

    override suspend fun parseChapter(chapterUrl: String): String {
        // Extract rawId and chapterNo from URL
        // URL format: en/serie-{rawId}/{slug}/chapter-{chapterNo}
        val regex = Regex("serie-(\\d+)/[^/]+/chapter-(\\d+)")
        val match = regex.find(chapterUrl) ?: throw Exception("Invalid chapter URL")
        val (rawId, chapterNo) = match.destructured
        
        val bodyJson = """
            {
                "translate": "ai",
                "language": "en",
                "raw_id": $rawId,
                "chapter_no": $chapterNo,
                "retry": false,
                "force_retry": false
            }
        """.trimIndent()
        
        val response = fetchJson("${site}api/reader/get", "POST", bodyJson)
        
        if (response.get("success").asBoolean) {
            val dataData = response.getAsJsonObject("data").getAsJsonObject("data")
            val bodyArray = dataData.getAsJsonArray("body")
            
            var html = StringBuilder()
            bodyArray.forEach { 
                html.append("<p>${it.asString}</p>")
            }
            
            var htmlString = html.toString()
            
            // Glossary replacement
            if (dataData.has("glossary_data") && !dataData.get("glossary_data").isJsonNull) {
                val glossaryData = dataData.getAsJsonObject("glossary_data")
                if (glossaryData.has("terms")) {
                    val terms = glossaryData.getAsJsonArray("terms")
                    terms.forEachIndexed { index, termElement ->
                        val termArray = termElement.asJsonArray
                        val englishArray = termArray[0]
                        val english = if (englishArray.isJsonArray) englishArray.asJsonArray[0].asString else englishArray.asString
                        val symbol = "※${index}⛬"
                        
                        htmlString = htmlString.replace(symbol, english)
                    }
                }
            }
            
            return htmlString
        } else {
            throw Exception("Failed to fetch chapter content")
        }
    }

    override fun getImageHeaders(): Headers? = null
}
