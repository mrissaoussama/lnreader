package com.rajarsheechatterjee.LNReader.plugins

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class WebViewCookieJar : CookieJar {
    private val cookieManager = CookieManager.getInstance()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val urlString = url.toString()
        for (cookie in cookies) {
            cookieManager.setCookie(urlString, cookie.toString())
        }
        cookieManager.flush()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val urlString = url.toString()
        val cookieHeader = cookieManager.getCookie(urlString) ?: return emptyList()
        
        val cookies = mutableListOf<Cookie>()
        val splitCookies = cookieHeader.split(";")
        for (cookieStr in splitCookies) {
            val cookie = Cookie.parse(url, cookieStr.trim())
            if (cookie != null) {
                cookies.add(cookie)
            }
        }
        return cookies
    }
}
