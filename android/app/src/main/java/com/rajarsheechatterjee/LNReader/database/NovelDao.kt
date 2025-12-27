package com.rajarsheechatterjee.LNReader.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update

@Dao
interface NovelDao {
    @Query("SELECT * FROM Novel WHERE id = :id")
    suspend fun getNovel(id: Long): Novel?

    @Query("SELECT * FROM Novel WHERE pluginId = :pluginId AND path = :path")
    suspend fun getNovel(pluginId: String, path: String): Novel?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(novel: Novel): Long

    @Update
    suspend fun update(novel: Novel)
    
    @Query("UPDATE Novel SET inLibrary = 1 WHERE id = :id")
    suspend fun addToLibrary(id: Long)
}
