package com.example.libraryapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.example.libraryapp.data.AddBookRequest
import com.example.libraryapp.data.ApiClient
import com.example.libraryapp.data.BorrowRequest
import com.example.libraryapp.data.Book
import com.example.libraryapp.ui.BookDetailScreen
import com.example.libraryapp.ui.BookListScreen
import com.example.libraryapp.ui.ScannerScreen
import kotlinx.coroutines.launch
import retrofit2.HttpException

// 简易 UI 状态机
private sealed interface Screen {
    data object Splash : Screen
    data object List : Screen
    data object Scanner : Screen
    data class Detail(val bookId: Long) : Screen
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme { LibraryApp() }
        }
    }
}

@Composable
fun LibraryApp() {
    var screen by remember { mutableStateOf<Screen>(Screen.Splash) }
    var books by remember { mutableStateOf<List<Book>>(emptyList()) }
    var keyword by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var detailBook by remember { mutableStateOf<Book?>(null) }
    var detailLoans by remember { mutableStateOf<List<com.example.libraryapp.data.LoanRecord>>(emptyList()) }
    var showSettings by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun <T> runLoad(tag: String, block: suspend () -> T, onDone: suspend (T) -> Unit = {}) {
        scope.launch {
            busy = true
            message = null
            try {
                onDone(block())
            } catch (e: HttpException) {
                message = if (e.code() == 409) "该书已在馆藏中"
                else "$tag 失败: ${e.message()}"
            } catch (e: Exception) {
                message = "$tag 失败: ${e.message ?: e.javaClass.simpleName}"
            } finally {
                busy = false
            }
        }
    }

    fun loadBooks(kw: String? = keyword.ifBlank { null }) {
        runLoad("加载", { ApiClient.api.books(kw) }) { books = it }
    }

    fun loadDetail(id: Long) {
        runLoad("加载", {
            val b = ApiClient.api.books().firstOrNull { it.id == id }
            val l = ApiClient.api.loans(id)
            b to l
        }) { (b, l) ->
            detailBook = b
            detailLoans = l
        }
    }

    when (val s = screen) {
        Screen.Splash -> {
            LaunchedEffect(Unit) {
                kotlinx.coroutines.delay(1600)
                screen = Screen.List
            }
            com.example.libraryapp.ui.SplashScreen()
        }

        Screen.Scanner -> ScannerScreen(
            onDetected = { raw ->
                // 扫到的内容可能是 ISBN，也可能是含 ISBN 的二维码文本，服务端会自动提取
                screen = Screen.List
                runLoad("查询", { ApiClient.api.lookup(raw) }) { info ->
                    try {
                        ApiClient.api.add(AddBookRequest(isbn = info.isbn))
                        message = "已加入《${info.title}》"
                    } catch (e: HttpException) {
                        message = if (e.code() == 409) "该书已在馆藏中"
                        else "加入失败: ${e.message()}"
                    } catch (e: Exception) {
                        message = "加入失败: ${e.message}"
                    }
                    loadBooks(null)
                }
            },
            onClose = { screen = Screen.List }
        )

        is Screen.Detail -> {
            val book = detailBook
            if (book != null && book.id == s.bookId) {
                BookDetailScreen(
                    book = book,
                    loans = detailLoans,
                    busy = busy,
                    onBack = { screen = Screen.List },
                    onBorrow = { name ->
                        runLoad("借出", {
                            ApiClient.api.borrow(s.bookId, BorrowRequest(name))
                        }) {
                            detailBook = it
                            message = "已借出"
                            loadDetail(s.bookId)
                        }
                    },
                    onReturn = {
                        runLoad("归还", { ApiClient.api.returnBook(s.bookId) }) {
                            detailBook = it
                            message = "已归还"
                            loadDetail(s.bookId)
                        }
                    },
                    onUpdate = { copies, location ->
                        runLoad("更新", {
                            ApiClient.api.update(
                                s.bookId, mapOf("copies" to copies, "location" to location)
                            )
                        }) {
                            detailBook = it
                            loadDetail(s.bookId)
                        }
                    },
                    onDelete = {
                        runLoad("删除", { ApiClient.api.delete(s.bookId) }) {
                            screen = Screen.List
                            loadBooks(null)
                        }
                    }
                )
            }
        }

        Screen.List -> {
            LaunchedEffect(Unit) { loadBooks(null) }
            if (showSettings) {
                SettingsDialog(onDismiss = { showSettings = false })
            }
            BookListScreen(
                books = books,
                statsTitle = message ?: "共 ${books.size} 种图书",
                keyword = keyword,
                onKeywordChange = { keyword = it },
                onRefresh = { loadBooks() },
                onScan = { screen = Screen.Scanner },
                onBookClick = { book ->
                    screen = Screen.Detail(book.id)
                    loadDetail(book.id)
                },
                onOpenSettings = { showSettings = true },
                busy = busy,
                message = null
            )
        }
    }
}

@Composable
fun SettingsDialog(onDismiss: () -> Unit) {
    var url by remember { mutableStateOf(ApiClient.baseUrl) }
    var error by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("服务器地址") },
        text = {
            Column {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it; error = false },
                    singleLine = true,
                    placeholder = { Text("http://192.168.x.x:3000") },
                    isError = error
                )
                if (error) {
                    Text("格式应为 http://IP:3000", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (ApiClient.setBaseUrl(url.trim())) onDismiss() else error = true
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}
