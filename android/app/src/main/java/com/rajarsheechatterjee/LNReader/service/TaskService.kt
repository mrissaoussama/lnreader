package com.rajarsheechatterjee.LNReader.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.rajarsheechatterjee.LNReader.database.AppDatabase
import com.rajarsheechatterjee.LNReader.plugins.PluginManager
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentLinkedQueue

class TaskService : Service() {

    private val serviceJob = Job()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private val taskQueue = ConcurrentLinkedQueue<Task>()
    private var isRunning = false
    private val client = okhttp3.OkHttpClient()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startService()
            ACTION_STOP -> stopService()
            ACTION_ADD_TASK -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID)
                val taskType = intent.getStringExtra(EXTRA_TASK_TYPE)
                val taskData = intent.getStringExtra(EXTRA_TASK_DATA) // JSON string
                if (taskId != null && taskType != null) {
                    addTask(Task(taskId, taskType, taskData))
                }
            }
        }
        return START_NOT_STICKY
    }

    private fun startService() {
        if (isRunning) return
        isRunning = true
        
        // Load plugins on startup
        PluginManager.instance.loadExternalPlugins(applicationContext)
        
        createNotificationChannel()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("LNReader Service")
            .setContentText("Processing tasks...")
            .setSmallIcon(android.R.drawable.ic_dialog_info) // Replace with app icon
            .build()
        startForeground(1, notification)

        serviceScope.launch {
            processQueue()
        }
    }

    private fun stopService() {
        isRunning = false
        stopForeground(true)
        stopSelf()
    }

    private fun addTask(task: Task) {
        taskQueue.offer(task)
        if (!isRunning) {
            startService()
        }
    }

    private suspend fun processQueue() {
        while (isRunning) {
            val task = taskQueue.poll()
            if (task != null) {
                try {
                    executeTask(task)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            } else {
                delay(1000) // Wait for new tasks
            }
        }
    }

    private suspend fun executeTask(task: Task) {
        if (task.type == "DOWNLOAD_CHAPTER") {
            try {
                val data = org.json.JSONObject(task.data!!)
                val pluginId = data.getString("pluginId")
                val chapterUrl = data.getString("chapterUrl")
                val novelId = data.getLong("novelId")
                val chapterId = data.getLong("chapterId")
                // Allow JS to pass the exact path where it wants the file
                val savePath = if (data.has("savePath")) data.getString("savePath") else null

                val plugin = PluginManager.instance.getPlugin(pluginId)
                if (plugin != null) {
                    // Notify start
                    sendProgress(task.id, 0, "Starting download...")

                    val html = plugin.parseChapter(chapterUrl)
                    
                    // Determine output directory
                    val chapterDir = if (savePath != null) {
                        java.io.File(savePath)
                    } else {
                        val context = applicationContext
                        val rootDir = context.getExternalFilesDir(null) ?: context.filesDir
                        java.io.File(rootDir, "novels/$pluginId/$novelId/$chapterId")
                    }
                    
                    if (!chapterDir.exists()) {
                        chapterDir.mkdirs()
                    }
                    
                    // Create .nomedia to prevent gallery scanning
                    java.io.File(chapterDir, ".nomedia").createNewFile()

                    // Process and download images
                    val processedHtml = downloadChapterImages(html, plugin, chapterDir, task.id)
                    
                    val indexFile = java.io.File(chapterDir, "index.html")
                    indexFile.writeText(processedHtml)
                    
                    // Update DB
                    val db = AppDatabase.getDatabase(applicationContext)
                    db.chapterDao().updateDownloadStatus(chapterId, 1)
                    
                    // Notify completion
                    sendProgress(task.id, 100, "Downloaded")
                }
            } catch (e: Exception) {
                e.printStackTrace()
                sendProgress(task.id, -1, "Error: ${e.message}")
            }
        }
    }

    private suspend fun downloadChapterImages(html: String, plugin: com.rajarsheechatterjee.LNReader.plugins.Plugin, outputDir: java.io.File, taskId: String): String {
        val doc = org.jsoup.Jsoup.parse(html)
        val images = doc.select("img")
        
        images.forEachIndexed { index, img ->
            val url = img.attr("src")
            if (url.isNotEmpty()) {
                try {
                    // Resolve absolute URL if relative
                    val absoluteUrl = if (url.startsWith("http")) url else java.net.URI(plugin.site).resolve(url).toString()
                    
                    val request = okhttp3.Request.Builder()
                        .url(absoluteUrl)
                        .headers(plugin.getImageHeaders() ?: okhttp3.Headers.Builder().build())
                        .build()
                        
                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) {
                        val bytes = response.body?.bytes()
                        if (bytes != null) {
                            val fileName = "$index.b64.png" // Keeping naming convention
                            val file = java.io.File(outputDir, fileName)
                            file.writeBytes(bytes)
                            
                            // Update src to local path
                            img.attr("src", "file://${file.absolutePath}")
                        }
                    }
                    response.close()
                } catch (e: Exception) {
                    e.printStackTrace()
                    // Keep original URL if download fails
                }
            }
            // Update progress
            val progress = ((index + 1).toFloat() / images.size * 100).toInt()
            sendProgress(taskId, progress, "Downloading images ${index + 1}/${images.size}")
        }
        return doc.outerHtml()
    }

    private fun sendProgress(taskId: String, progress: Int, message: String) {
        val intent = Intent(ACTION_PROGRESS)
        intent.putExtra(EXTRA_TASK_ID, taskId)
        intent.putExtra(EXTRA_PROGRESS, progress)
        intent.putExtra(EXTRA_MESSAGE, message)
        sendBroadcast(intent)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Background Tasks",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
    }

    companion object {
        const val CHANNEL_ID = "lnreader_service_channel"
        const val ACTION_START = "START"
        const val ACTION_STOP = "STOP"
        const val ACTION_ADD_TASK = "ADD_TASK"
        
        const val EXTRA_TASK_ID = "taskId"
        const val EXTRA_TASK_TYPE = "taskType"
        const val EXTRA_TASK_DATA = "taskData"
        
        const val ACTION_PROGRESS = "com.rajarsheechatterjee.LNReader.TASK_PROGRESS"
        const val EXTRA_PROGRESS = "progress"
        const val EXTRA_MESSAGE = "message"
    }

    data class Task(
        val id: String,
        val type: String,
        val data: String?
    )
}
