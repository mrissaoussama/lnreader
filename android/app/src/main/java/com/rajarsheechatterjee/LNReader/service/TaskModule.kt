package com.rajarsheechatterjee.LNReader.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.rajarsheechatterjee.LNReader.plugins.PluginManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

class TaskModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val scope = CoroutineScope(Dispatchers.IO)
    
    private val progressReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == TaskService.ACTION_PROGRESS) {
                val taskId = intent.getStringExtra(TaskService.EXTRA_TASK_ID)
                val progress = intent.getIntExtra(TaskService.EXTRA_PROGRESS, 0)
                val message = intent.getStringExtra(TaskService.EXTRA_MESSAGE)
                
                val params = com.facebook.react.bridge.WritableNativeMap()
                params.putString("taskId", taskId)
                params.putInt("progress", progress)
                params.putString("message", message)
                
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("TASK_PROGRESS", params)
            }
        }
    }

    init {
        val filter = IntentFilter(TaskService.ACTION_PROGRESS)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(progressReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(progressReceiver, filter)
        }
    }

    override fun getName(): String {
        return "TaskModule"
    }

    @ReactMethod
    fun startService() {
        val intent = Intent(reactApplicationContext, TaskService::class.java)
        intent.action = TaskService.ACTION_START
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactApplicationContext, TaskService::class.java)
        intent.action = TaskService.ACTION_STOP
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun queueTask(taskId: String, taskType: String, taskData: String) {
        val intent = Intent(reactApplicationContext, TaskService::class.java)
        intent.action = TaskService.ACTION_ADD_TASK
        intent.putExtra(TaskService.EXTRA_TASK_ID, taskId)
        intent.putExtra(TaskService.EXTRA_TASK_TYPE, taskType)
        intent.putExtra(TaskService.EXTRA_TASK_DATA, taskData)
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun getPlugins(promise: com.facebook.react.bridge.Promise) {
        try {
            // Reload plugins to ensure we have the latest
            PluginManager.instance.loadExternalPlugins(reactApplicationContext)
            
            val plugins = PluginManager.instance.getAllPlugins()
            val result = com.facebook.react.bridge.WritableNativeArray()
            for (plugin in plugins) {
                val map = com.facebook.react.bridge.WritableNativeMap()
                map.putString("id", plugin.id)
                map.putString("name", plugin.name)
                map.putInt("version", plugin.version)
                map.putString("site", plugin.site)
                map.putString("language", plugin.language)
                map.putString("iconUrl", plugin.iconUrl)
                map.putBoolean("isNative", true)
                val pkgName = PluginManager.instance.getPluginPackage(plugin.id)
                if (pkgName != null) {
                    map.putString("packageName", pkgName)
                }
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PLUGIN_ERROR", e.message)
        }
    }

    @ReactMethod
    fun uninstallPlugin(packageName: String, promise: com.facebook.react.bridge.Promise) {
        try {
            val intent = Intent(Intent.ACTION_DELETE)
            intent.data = android.net.Uri.parse("package:$packageName")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UNINSTALL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun popularNovels(pluginId: String, page: Int, options: String?, promise: com.facebook.react.bridge.Promise) {
        scope.launch {
            try {
                val plugin = PluginManager.instance.getPlugin(pluginId)
                if (plugin == null) {
                    promise.reject("PLUGIN_NOT_FOUND", "Plugin not found: $pluginId")
                    return@launch
                }
                val novels = plugin.popularNovels(page, options)
                val result = com.facebook.react.bridge.WritableNativeArray()
                for (novel in novels) {
                    val map = com.facebook.react.bridge.WritableNativeMap()
                    map.putString("name", novel.name)
                    map.putString("path", novel.url)
                    map.putString("cover", novel.coverUrl)
                    result.pushMap(map)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("PLUGIN_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun searchNovels(pluginId: String, query: String, page: Int, promise: com.facebook.react.bridge.Promise) {
        scope.launch {
            try {
                val plugin = PluginManager.instance.getPlugin(pluginId)
                if (plugin == null) {
                    promise.reject("PLUGIN_NOT_FOUND", "Plugin not found: $pluginId")
                    return@launch
                }
                val novels = plugin.searchNovels(query, page)
                val result = com.facebook.react.bridge.WritableNativeArray()
                for (novel in novels) {
                    val map = com.facebook.react.bridge.WritableNativeMap()
                    map.putString("name", novel.name)
                    map.putString("path", novel.url)
                    map.putString("cover", novel.coverUrl)
                    result.pushMap(map)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("PLUGIN_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun parseNovel(pluginId: String, novelPath: String, promise: com.facebook.react.bridge.Promise) {
        scope.launch {
            try {
                val plugin = PluginManager.instance.getPlugin(pluginId)
                if (plugin == null) {
                    promise.reject("PLUGIN_NOT_FOUND", "Plugin not found: $pluginId")
                    return@launch
                }
                val details = plugin.parseNovelDetails(novelPath)
                val map = com.facebook.react.bridge.WritableNativeMap()
                map.putString("path", details.url)
                map.putString("name", details.name)
                map.putString("cover", details.coverUrl)
                map.putString("author", details.author)
                map.putString("artist", details.artist)
                map.putString("summary", details.description)
                map.putString("genres", details.genre)
                map.putString("status", details.status)
                
                val chapters = com.facebook.react.bridge.WritableNativeArray()
                for (chapter in details.chapters) {
                    val chMap = com.facebook.react.bridge.WritableNativeMap()
                    chMap.putString("name", chapter.name)
                    chMap.putString("path", chapter.url)
                    chMap.putString("releaseTime", chapter.releaseDate)
                    chMap.putString("chapterNumber", chapter.chapterNumber)
                    chapters.pushMap(chMap)
                }
                map.putArray("chapters", chapters)
                
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("PLUGIN_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun parseChapter(pluginId: String, chapterPath: String, promise: com.facebook.react.bridge.Promise) {
        scope.launch {
            try {
                val plugin = PluginManager.instance.getPlugin(pluginId)
                if (plugin == null) {
                    promise.reject("PLUGIN_NOT_FOUND", "Plugin not found: $pluginId")
                    return@launch
                }
                val content = plugin.parseChapter(chapterPath)
                promise.resolve(content)
            } catch (e: Exception) {
                promise.reject("PLUGIN_ERROR", e.message)
            }
        }
    }
}
