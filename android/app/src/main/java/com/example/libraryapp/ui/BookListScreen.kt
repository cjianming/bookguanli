package com.example.libraryapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.libraryapp.data.Book

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookListScreen(
    books: List<Book>,
    statsTitle: String,
    keyword: String,
    onKeywordChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onScan: () -> Unit,
    onBookClick: (Book) -> Unit,
    onOpenSettings: () -> Unit,
    busy: Boolean,
    message: String?
) {
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("图书馆管理") },
                actions = {
                    IconButton(onClick = onOpenSettings) { Text("⚙") }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = onScan) { Text("＋ 扫码加入") }
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().padding(horizontal = 12.dp)) {
            if (message != null) {
                Text(message, color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(vertical = 4.dp))
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = keyword,
                    onValueChange = onKeywordChange,
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    placeholder = { Text("搜索书名 / 作者 / ISBN") }
                )
                Spacer(Modifier.width(8.dp))
                Button(onClick = onRefresh, enabled = !busy) { Text("搜索") }
            }
            Text(statsTitle, Modifier.padding(vertical = 6.dp),
                style = MaterialTheme.typography.bodySmall)

            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(books, key = { it.id }) { book ->
                    Card(onClick = { onBookClick(book) }) {
                        Row(Modifier.padding(10.dp)) {
                            AsyncImage(
                                model = book.coverUrl,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(width = 64.dp, height = 88.dp)
                                    .clip(RoundedCornerShape(6.dp))
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(book.title, style = MaterialTheme.typography.titleMedium,
                                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(book.author ?: "", maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall)
                                Text("ISBN ${book.isbn}", style = MaterialTheme.typography.bodySmall)
                                Text(
                                    "位置：${book.location?.takeIf { it.isNotBlank() } ?: "未设置"}　·　馆藏 ${book.copies} 册",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.tertiary
                                )
                            }
                            Spacer(Modifier.width(8.dp))
                            AssistChip(
                                onClick = {},
                                label = {
                                    Text(
                                        if (book.available > 0)
                                            "在馆 ${book.available}/${book.copies}"
                                        else "已借出 ${book.copies}/${book.copies}"
                                    )
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
