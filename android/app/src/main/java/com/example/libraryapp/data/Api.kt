package com.example.libraryapp.data

import com.google.gson.annotations.SerializedName
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

data class Book(
    val id: Long,
    val isbn: String,
    val title: String,
    val author: String? = "",
    val publisher: String? = "",
    val pubdate: String? = "",
    @SerializedName("cover_url") val coverUrl: String? = "",
    val description: String? = "",
    val copies: Int = 1,
    val available: Int = 1,
    val location: String? = ""
)

data class AddBookRequest(
    val isbn: String,
    val copies: Int = 1,
    val location: String = ""
)

data class BorrowRequest(val borrower: String)

data class LoanRecord(
    val id: Long,
    val borrower: String,
    val borrowed_at: String,
    val returned_at: String? = null
)

interface LibraryApi {
    @GET("api/books")
    suspend fun books(@Query("keyword") keyword: String? = null): List<Book>

    @GET("api/lookup/{isbn}")
    suspend fun lookup(@Path("isbn") isbn: String): Book

    @POST("api/books")
    suspend fun add(@Body body: AddBookRequest): Book

    @PUT("api/books/{id}")
    suspend fun update(@Path("id") id: Long, @Body body: Map<String, Any?>): Book

    @DELETE("api/books/{id}")
    suspend fun delete(@Path("id") id: Long): Map<String, Any>

    @POST("api/books/{id}/borrow")
    suspend fun borrow(@Path("id") id: Long, @Body body: BorrowRequest): Book

    @POST("api/books/{id}/return")
    suspend fun returnBook(@Path("id") id: Long): Book

    @GET("api/books/{id}/loans")
    suspend fun loans(@Path("id") id: Long): List<LoanRecord>
}

object ApiClient {
    @Volatile
    var baseUrl: String = "http://192.168.1.100:3000/"
        private set

    @Volatile
    private var cached: LibraryApi? = null

    /** 更新服务器地址，如 http://192.168.1.100:3000/ */
    fun setBaseUrl(url: String): Boolean {
        val normalized = if (url.endsWith("/")) url else "$url/"
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) return false
        baseUrl = normalized
        cached = null
        return true
    }

    val api: LibraryApi
        get() = cached ?: synchronized(this) {
            cached ?: Retrofit.Builder()
                .baseUrl(baseUrl)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(LibraryApi::class.java)
                .also { cached = it }
        }
}
