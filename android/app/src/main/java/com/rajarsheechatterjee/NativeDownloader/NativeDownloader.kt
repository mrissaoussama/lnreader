package com.rajarsheechatterjee.NativeDownloader

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.lnreader.spec.NativeDownloaderSpec
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import android.util.Log

class NativeDownloader(reactContext: ReactApplicationContext) : NativeDownloaderSpec(reactContext) {
    companion object {
        @Volatile private var maxSimultaneous: Int = 0 // 0 = unlimited
        @Volatile private var maxPerPlugin: Int = 0 // 0 = unlimited
        @Volatile private var delayBetweenSamePluginMs: Long = 0L

        @Volatile private var running: Int = 0
        private val pluginRunning = HashMap<String, Int>()
        private val pluginLastStart = HashMap<String, Long>()
        private val pausedChapters = HashSet<Int>()
        private val cancelledChapters = HashSet<Int>()
        private val threads = HashMap<Int, Thread>()

        private fun canStart(pluginId: String): Boolean {
            if (maxSimultaneous > 0 && running >= maxSimultaneous) return false
            if (maxPerPlugin > 0 && (pluginRunning[pluginId] ?: 0) >= maxPerPlugin) return false
            if (delayBetweenSamePluginMs > 0) {
                val last = pluginLastStart[pluginId] ?: 0L
                val now = System.currentTimeMillis()
                if (now - last < delayBetweenSamePluginMs) return false
            }
            return true
        }

        @Synchronized private fun onStart(pluginId: String) {
            running += 1
            pluginRunning[pluginId] = (pluginRunning[pluginId] ?: 0) + 1
            pluginLastStart[pluginId] = System.currentTimeMillis()
        }

        @Synchronized private fun onFinish(pluginId: String, chapterId: Int) {
            running = maxOf(0, running - 1)
            pluginRunning[pluginId] = maxOf(0, (pluginRunning[pluginId] ?: 1) - 1)
            pausedChapters.remove(chapterId)
            cancelledChapters.remove(chapterId)
            threads.remove(chapterId)
        }
    }

    private fun log(message: String) {
        Log.d("NativeDownloader", message)
    }

    private fun sendProgress(chapterId: Int, index: Int, total: Int, url: String) {
        try {
            val params = Arguments.createMap().apply {
                putInt("chapterId", chapterId)
                putInt("index", index)
                putInt("total", total)
                putString("url", url)
            }
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("NativeDownloaderProgress", params)
        } catch (_: Exception) {
        }
    }

    @ReactMethod
    override fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    override fun setLimits(
        maxSimultaneous: Double,
        maxPerPlugin: Double,
        delayBetweenSamePluginMs: Double,
        promise: Promise
    ) {
        Companion.maxSimultaneous = maxSimultaneous.toInt()
        Companion.maxPerPlugin = maxPerPlugin.toInt()
        Companion.delayBetweenSamePluginMs = delayBetweenSamePluginMs.toLong()
        promise.resolve(null)
    }

    @ReactMethod
    override fun pauseChapter(chapterId: Double, promise: Promise) {
        val id = chapterId.toInt()
        synchronized(Companion) { pausedChapters.add(id) }
        promise.resolve(null)
    }

    @ReactMethod
    override fun resumeChapter(chapterId: Double, promise: Promise) {
        val id = chapterId.toInt()
        synchronized(Companion) { pausedChapters.remove(id) }
        promise.resolve(null)
    }

    @ReactMethod
    override fun cancelChapter(chapterId: Double, promise: Promise) {
        val id = chapterId.toInt()
        synchronized(Companion) {
            cancelledChapters.add(id)
            threads[id]?.interrupt()
        }
        promise.resolve(null)
    }

    private fun ensureDir(destDirPath: String) {
        val destDir = File(destDirPath)
        if (!destDir.exists()) destDir.mkdirs()
    }

    @ReactMethod
    override fun downloadImages(
        chapterId: Double,
        pluginId: String,
        destDirPath: String,
        urls: ReadableArray,
        headers: ReadableMap?,
        promise: Promise
    ) {
        val chId = chapterId.toInt()
        val total = urls.size()
        val worker = Thread {
            while (!canStart(pluginId)) {
                try { Thread.sleep(25) } catch (_: Throwable) {}
            }
            onStart(pluginId)

            synchronized(Companion) { threads[chId] = Thread.currentThread() }
            val results = Arguments.createArray()
            try {
                ensureDir(destDirPath)

                for (i in 0 until total) {
                    if (cancelledChapters.contains(chId)) {
                        throw InterruptedException("Chapter $chId cancelled")
                    }
                    while (pausedChapters.contains(chId)) {
                        try { Thread.sleep(100) } catch (_: Throwable) {}
                        if (cancelledChapters.contains(chId)) {
                            throw InterruptedException("Chapter $chId cancelled")
                        }
                    }
                    val urlStr = urls.getString(i) ?: continue
                    val outFile = File(destDirPath, "$i.b64.png")

                    var connection: HttpURLConnection? = null
                    try {
                        val url = URL(urlStr)
                        connection = (url.openConnection() as HttpURLConnection).apply {
                            requestMethod = "GET"
                            connectTimeout = 15000
                            readTimeout = 30000
                            headers?.entryIterator?.forEachRemaining { entry ->
                                setRequestProperty(entry.key, entry.value.toString())
                            }
                        }

                        connection.inputStream.use { input ->
                            FileOutputStream(outFile).use { fos ->
                                val buf = ByteArray(16 * 1024)
                                while (true) {
                                    if (cancelledChapters.contains(chId)) {
                                        throw InterruptedException("Chapter $chId cancelled")
                                    }
                                    while (pausedChapters.contains(chId)) {
                                        try { Thread.sleep(100) } catch (_: Throwable) {}
                                        if (cancelledChapters.contains(chId)) {
                                            throw InterruptedException("Chapter $chId cancelled")
                                        }
                                    }
                                    val read = input.read(buf)
                                    if (read <= 0) break
                                    fos.write(buf, 0, read)
                                }
                                fos.flush()
                            }
                        }
                        sendProgress(chId, i, total, urlStr)
                        results.pushString(outFile.absolutePath)
                    } catch (e: Exception) {
                        results.pushString("")
                    } finally {
                        connection?.disconnect()
                        try { Thread.sleep(10) } catch (_: Throwable) {}
                    }
                }
                promise.resolve(results)
            } catch (e: Exception) {
                promise.reject(e)
            } finally {
                onFinish(pluginId, chId)
            }
        }
        worker.start()
    }

    @ReactMethod
    override fun downloadChapterAssets(
        chapterId: Double,
        pluginId: String,
        destDirPath: String,
        html: String,
        urls: ReadableArray,
        headers: ReadableMap?,
        promise: Promise
    ) {
        val chId = chapterId.toInt()
        val total = urls.size()
        val worker = Thread {
            while (!canStart(pluginId)) {
                try { Thread.sleep(25) } catch (_: Throwable) {}
            }
            onStart(pluginId)
            synchronized(Companion) { threads[chId] = Thread.currentThread() }
            try {
                ensureDir(destDirPath)
                // Write HTML first
                val indexFile = File(destDirPath, "index.html")
                indexFile.writeText(html)
                // Then download images
                for (i in 0 until total) {
                    if (cancelledChapters.contains(chId)) {
                        throw InterruptedException("Chapter $chId cancelled")
                    }
                    while (pausedChapters.contains(chId)) {
                        try { Thread.sleep(100) } catch (_: Throwable) {}
                        if (cancelledChapters.contains(chId)) {
                            throw InterruptedException("Chapter $chId cancelled")
                        }
                    }
                    val urlStr = urls.getString(i) ?: continue
                    val outFile = File(destDirPath, "$i.b64.png")
                    var connection: HttpURLConnection? = null
                    try {
                        val url = URL(urlStr)
                        connection = (url.openConnection() as HttpURLConnection).apply {
                            requestMethod = "GET"
                            connectTimeout = 15000
                            readTimeout = 30000
                            headers?.entryIterator?.forEachRemaining { entry ->
                                setRequestProperty(entry.key, entry.value.toString())
                            }
                        }
                        connection.inputStream.use { input ->
                            FileOutputStream(outFile).use { fos ->
                                val buf = ByteArray(16 * 1024)
                                while (true) {
                                    if (cancelledChapters.contains(chId)) {
                                        throw InterruptedException("Chapter $chId cancelled")
                                    }
                                    while (pausedChapters.contains(chId)) {
                                        try { Thread.sleep(100) } catch (_: Throwable) {}
                                        if (cancelledChapters.contains(chId)) {
                                            throw InterruptedException("Chapter $chId cancelled")
                                        }
                                    }
                                    val read = input.read(buf)
                                    if (read <= 0) break
                                    fos.write(buf, 0, read)
                                }
                                fos.flush()
                            }
                        }
                        sendProgress(chId, i, total, urlStr)
                    } catch (_: Exception) {
                        // Ignore per-image errors; index.html already written
                    } finally {
                        connection?.disconnect()
                        try { Thread.sleep(10) } catch (_: Throwable) {}
                    }
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject(e)
            } finally {
                onFinish(pluginId, chId)
            }
        }
        worker.start()
    }
}
