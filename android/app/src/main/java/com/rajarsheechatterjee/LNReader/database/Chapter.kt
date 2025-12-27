package com.rajarsheechatterjee.LNReader.database

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "Chapter",
    foreignKeys = [ForeignKey(
        entity = Novel::class,
        parentColumns = ["id"],
        childColumns = ["novelId"],
        onDelete = ForeignKey.CASCADE
    )],
    indices = [
        Index(value = ["novelId", "position", "page", "id"], name = "chapterNovelIdIndex"),
        Index(value = ["path", "novelId"], unique = true)
    ]
)
data class Chapter(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val novelId: Long,
    val path: String,
    val name: String,
    val releaseTime: String?,
    val bookmark: Int = 0,
    val unread: Int = 1,
    val readTime: String?,
    val isDownloaded: Int = 0,
    val updatedTime: String?,
    val chapterNumber: Double?,
    val page: String? = "1",
    val position: Int = 0,
    val progress: Int?
)
