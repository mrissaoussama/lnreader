package com.lnreader.plugins.citrusaurora

import com.rajarsheechatterjee.LNReader.plugins.Plugin
import com.rajarsheechatterjee.LNReader.plugins.PluginChapter
import com.rajarsheechatterjee.LNReader.plugins.PluginNovel
import com.rajarsheechatterjee.LNReader.plugins.PluginNovelDetails
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.FormBody
import org.jsoup.Jsoup
import java.io.IOException
import java.net.URLEncoder

class CitrusAurora : Plugin {
    override val id = "citrusaurora"
    override val name = "Citrus Aurora"
    override val version = 1
    override val iconUrl = "https://citrusaurora.com/wp-content/uploads/2022/05/cropped-Citrus-Aurora-Logo-1-192x192.png"
    override val site = "https://citrusaurora.com"
    override val language = "en"

    private val client = OkHttpClient()

    private fun fetchText(url: String, method: String = "GET", body: okhttp3.RequestBody? = null): String {
        val builder = Request.Builder().url(url)
        if (method == "POST" && body != null) {
            builder.post(body)
        }
        client.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Unexpected code $response")
            return response.body?.string() ?: ""
        }
    }

    override suspend fun popularNovels(page: Int, options: String?): List<PluginNovel> {
        val url = "$site/page/$page/?s=&post_type=wp-manga&m_orderby=latest"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        doc.select(".manga-title-badges").remove()
        
        return doc.select(".page-item-detail, .c-tabs-item__content").mapNotNull { el ->
            val titleEl = el.selectFirst(".post-title a")
            val name = titleEl?.text()?.trim() ?: return@mapNotNull null
            val path = titleEl.attr("href").replace(site, "").trim('/')
            
            val img = el.selectFirst("img")
            val cover = img?.attr("data-src") ?: img?.attr("src") ?: img?.attr("data-lazy-srcset")
            
            PluginNovel(name, path, cover)
        }
    }

    override suspend fun searchNovels(query: String, page: Int): List<PluginNovel> {
        val encodedQuery = URLEncoder.encode(query, "UTF-8")
        val url = "$site/page/$page/?s=$encodedQuery&post_type=wp-manga"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        return doc.select(".c-tabs-item__content").mapNotNull { el ->
            val titleEl = el.selectFirst(".post-title a")
            val name = titleEl?.text()?.trim() ?: return@mapNotNull null
            val path = titleEl.attr("href").replace(site, "").trim('/')
            
            val img = el.selectFirst("img")
            val cover = img?.attr("data-src") ?: img?.attr("src")
            
            PluginNovel(name, path, cover)
        }
    }

    override suspend fun parseNovelDetails(novelUrl: String): PluginNovelDetails {
        val url = "$site/$novelUrl/"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        doc.select(".manga-title-badges, #manga-title span").remove()
        
        val name = doc.select(".post-title h1").text().trim().ifEmpty { 
            doc.select("#manga-title h1").text().trim() 
        }
        
        val cover = doc.select(".summary_image > a > img").let { img ->
            img.attr("data-lazy-src").ifEmpty { img.attr("data-src").ifEmpty { img.attr("src") } }
        }

        var author: String? = null
        var artist: String? = null
        var genres: String? = null
        var status: String? = null

        doc.select(".post-content_item, .post-content").forEach { item ->
            val heading = item.select("h5").text().trim()
            val content = item.select(".summary-content").text().trim()
            
            when {
                heading.contains("Author") -> author = content
                heading.contains("Artist") -> artist = content
                heading.contains("Genre") -> genres = content
                heading.contains("Status") -> status = content
            }
        }

        val summary = doc.select("div.summary__content").text().trim()

        // Chapters
        // Madara often loads chapters via AJAX
        val novelId = doc.select(".rating-post-id").attr("value").ifEmpty { 
            doc.select("#manga-chapters-holder").attr("data-id") 
        }

        val chapterHtml = if (novelId.isNotEmpty()) {
            val formBody = FormBody.Builder()
                .add("action", "manga_get_chapters")
                .add("manga", novelId)
                .build()
            fetchText("$site/wp-admin/admin-ajax.php", "POST", formBody)
        } else {
            // Fallback or new endpoint logic
            ""
        }

        val chapterDoc = if (chapterHtml != "0" && chapterHtml.isNotEmpty()) Jsoup.parse(chapterHtml) else doc
        
        val chapters = chapterDoc.select(".wp-manga-chapter").map { el ->
            val link = el.selectFirst("a")
            val chName = link?.text()?.trim() ?: ""
            val chPath = link?.attr("href")?.replace(site, "")?.trim('/') ?: ""
            val date = el.select("span.chapter-release-date").text().trim()
            
            PluginChapter(chName, chPath, date, null)
        }.reversed()

        return PluginNovelDetails(
            name = name,
            url = novelUrl,
            coverUrl = cover,
            author = author,
            artist = artist,
            description = summary,
            genre = genres,
            status = status,
            chapters = chapters
        )
    }

    override suspend fun parseChapter(chapterUrl: String): String {
        val url = "$site/$chapterUrl/"
        val body = fetchText(url)
        val doc = Jsoup.parse(body)
        
        val content = doc.select(".text-left, .text-right, .entry-content, .c-blog-post > div > div:nth-child(2)").firstOrNull()
        return content?.html() ?: ""
    }

    override fun getImageHeaders(): Headers? = null
}
