package com.rajarsheechatterjee.LNReader

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Request
import org.jsoup.Jsoup
import java.io.IOException

class HtmlParserModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "HtmlParser"
    }

    private fun fetchUrl(url: String, headers: ReadableMap?): String {
        val client = OkHttpClientProvider.getOkHttpClient()
        val requestBuilder = Request.Builder().url(url)

        if (headers != null) {
            val iterator = headers.keySetIterator()
            while (iterator.hasNextKey()) {
                val key = iterator.nextKey()
                val value = headers.getString(key)
                if (value != null) {
                    requestBuilder.addHeader(key, value)
                }
            }
        }
        // Add default User-Agent if not present
        if (headers == null || !headers.hasKey("User-Agent")) {
             requestBuilder.addHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        }

        val request = requestBuilder.build()
        val response = client.newCall(request).execute()
        
        if (!response.isSuccessful) {
            throw IOException("Unexpected code $response")
        }

        return response.body?.string() ?: ""
    }

    @ReactMethod
    fun parse(url: String, selector: String, headers: ReadableMap?, promise: Promise) {
        Thread {
            try {
                val html = fetchUrl(url, headers)
                val doc = Jsoup.parse(html)
                val element = doc.selectFirst(selector)
                val result = element?.html() ?: ""
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("PARSE_ERROR", e.message)
            }
        }.start()
    }

    @ReactMethod
    fun parseArray(url: String, selector: String, headers: ReadableMap?, promise: Promise) {
        Thread {
            try {
                val html = fetchUrl(url, headers)
                val doc = Jsoup.parse(html)
                val elements = doc.select(selector)
                val result: WritableArray = Arguments.createArray()
                for (element in elements) {
                    result.pushString(element.outerHtml())
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("PARSE_ERROR", e.message)
            }
        }.start()
    }
    
    @ReactMethod
    fun getAttribute(url: String, selector: String, attribute: String, headers: ReadableMap?, promise: Promise) {
        Thread {
            try {
                val html = fetchUrl(url, headers)
                val doc = Jsoup.parse(html)
                val element = doc.selectFirst(selector)
                if (element != null) {
                    promise.resolve(element.attr(attribute))
                } else {
                    promise.resolve("")
                }
            } catch (e: Exception) {
                promise.reject("PARSE_ERROR", e.message)
            }
        }.start()
    }
}
