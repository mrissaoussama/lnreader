package com.rajarsheechatterjee.LNReader.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface ChapterDao {
    @Query("SELECT * FROM Chapter WHERE novelId = :novelId ORDER BY position ASC")
    suspend fun getChapters(novelId: Long): List<Chapter>

    @Query("SELECT * FROM Chapter WHERE id = :id")
    suspend fun getChapter(id: Long): Chapter?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(chapter: Chapter): Long

    @Update
    suspend fun update(chapter: Chapter)

    @Query("UPDATE Chapter SET isDownloaded = :isDownloaded WHERE id = :id")
    suspend fun updateDownloadStatus(id: Long, isDownloaded: Int)
}
