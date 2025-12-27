package com.rajarsheechatterjee.LNReader.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "Novel",
    indices = [Index(value = ["pluginId", "path", "id", "inLibrary"], name = "NovelIndex"), Index(value = ["path", "pluginId"], unique = true)]
)
data class Novel(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val path: String,
    val pluginId: String,
    val name: String,
    val cover: String?,
    val summary: String?,
    val author: String?,
    val artist: String?,
    val status: String? = "Unknown",
    val genres: String?,
    val inLibrary: Int = 0,
    val isLocal: Int = 0,
    val totalPages: Int = 0,
    val chaptersDownloaded: Int = 0,
    val chaptersUnread: Int = 0,
    val totalChapters: Int = 0,
    val hasNote: Int = 0,
    val lastReadAt: String?,
    val lastUpdatedAt: String?,
    val hasMatch: Int = 0
)
