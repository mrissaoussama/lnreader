package com.rajarsheechatterjee.LNReader.plugins

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import dalvik.system.PathClassLoader

class PluginManager {
    private val plugins = mutableMapOf<String, Plugin>()
    private val pluginPackages = mutableMapOf<String, String>()

    init {
        // Internal plugins will be registered when context is available
    }

    fun registerInternalPlugins(context: Context) {
        // Internal plugins logic removed as plugins are now external APKs
    }

    fun registerPlugin(plugin: Plugin, packageName: String? = null) {
        plugins[plugin.id] = plugin
        if (packageName != null) {
            pluginPackages[plugin.id] = packageName
        }
    }

    fun getPlugin(pluginId: String): Plugin? {
        return plugins[pluginId]
    }

    fun getPluginPackage(pluginId: String): String? {
        return pluginPackages[pluginId]
    }

    fun getAllPlugins(): List<Plugin> {
        return plugins.values.toList()
    }
    
    fun loadExternalPlugins(context: Context) {
        android.util.Log.d("PluginManager", "Starting loadExternalPlugins")
        val pm = context.packageManager
        val intent = Intent("com.rajarsheechatterjee.LNReader.PLUGIN")
        val resolvedPlugins = pm.queryIntentActivities(intent, PackageManager.GET_META_DATA)
        android.util.Log.d("PluginManager", "Found ${resolvedPlugins.size} potential plugins")
        
        for (resolveInfo in resolvedPlugins) {
            val packageName = resolveInfo.activityInfo.packageName
            android.util.Log.d("PluginManager", "Processing package: $packageName")
            try {
                val metaData = resolveInfo.activityInfo.metaData
                if (metaData != null && metaData.containsKey("com.rajarsheechatterjee.LNReader.PLUGIN_CLASS")) {
                    val className = metaData.getString("com.rajarsheechatterjee.LNReader.PLUGIN_CLASS")
                    android.util.Log.d("PluginManager", "Found PLUGIN_CLASS: $className")
                    if (className != null) {
                        try {
                            // Create a context for the plugin package to access its resources/code
                            val pluginContext = context.createPackageContext(
                                packageName,
                                Context.CONTEXT_INCLUDE_CODE or Context.CONTEXT_IGNORE_SECURITY
                            )
                            
                            // Load the class
                            val classLoader = PathClassLoader(
                                pluginContext.packageCodePath,
                                context.classLoader
                            )
                            
                            val pluginClass = Class.forName(className, true, classLoader)
                            val pluginInstance = pluginClass.getDeclaredConstructor().newInstance() as Plugin
                            
                            registerPlugin(pluginInstance, packageName)
                            android.util.Log.d("PluginManager", "Loaded plugin: ${pluginInstance.name}")
                            
                        } catch (e: Exception) {
                            e.printStackTrace()
                            android.util.Log.e("PluginManager", "Failed to load plugin from $packageName: ${e.message}")
                        }
                    }
                } else {
                    android.util.Log.d("PluginManager", "Activity in $packageName missing metadata")
                }
            } catch (e: Exception) {
                e.printStackTrace()
                android.util.Log.e("PluginManager", "Error processing package $packageName: ${e.message}")
            }
        }
    }
    
    companion object {
        val instance = PluginManager()
    }
}

