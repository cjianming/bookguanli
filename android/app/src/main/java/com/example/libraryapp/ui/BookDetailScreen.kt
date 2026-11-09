package com.example.libraryapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.background
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.libraryapp.data.ApiClient
import com.example.libraryapp.data.Book
import com.example.libraryapp.data.LoanRecord

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookDetailScreen(
    book: Book,
    loans: List<LoanRecord>,
    onBorrow: (String) -> Unit,
    onReturn: () -> Unit,
    onUpdate: (copies: Int, location: String) -> Unit,
    onDelete: () -> Unit,
    onBack: () -> Unit,
    busy: Boolean
) {
    var showBorrowDialog by remember { mutableStateOf(false) }
    var showEditDialog by remember { mutableStateOf(false) }

    Scaffold(topBar = {
        CenterAlignedTopAppBar(
            title = { Text("图书详情") },
            navigationIcon = {
                TextButton(onClick = onBack) { Text("返回") }
            }
        )
    }) { padding ->
        Column(
            Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(16.dp)
        ) {
            Row {
                AsyncImage(
                    model = ApiClient.coverUrl(book.isbn),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(width = 110.dp, height = 150.dp)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clip(RoundedCornerShape(8.dp))
                )
                Spacer(Modifier.width(16.dp))
                Column {
                    Text(book.title, style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(6.dp))
                    Text("作者：${book.author ?: "-"}", style = MaterialTheme.typography.bodyMedium)
                    Text("出版社：${book.publisher ?: "-"}", style = MaterialTheme.typography.bodyMedium)
                    Text("出版日期：${book.pubdate ?: "-"}", style = MaterialTheme.typography.bodyMedium)
                    Text("ISBN：${book.isbn}", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "在馆 ${book.available} / 馆藏 ${book.copies}　位置：${book.location ?: "-"}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            if (!book.description.isNullOrBlank()) {
                Spacer(Modifier.height(16.dp))
                Text("简介", style = MaterialTheme.typography.titleMedium)
                Text(book.description, style = MaterialTheme.typography.bodyMedium)
            }

            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { showBorrowDialog = true },
                    enabled = !busy && book.available > 0
                ) { Text("借出") }
                Button(
                    onClick = onReturn,
                    enabled = !busy && book.available < book.copies
                ) { Text("归还") }
                Button(onClick = { showEditDialog = true }, enabled = !busy) { Text("编辑") }
                Button(onClick = onDelete, enabled = !busy) { Text("删除") }
            }

            Spacer(Modifier.height(20.dp))
            Text("借阅记录", style = MaterialTheme.typography.titleMedium)
            if (loans.isEmpty()) {
                Text("暂无记录", style = MaterialTheme.typography.bodySmall)
            }
            loans.forEach { loan ->
                Text(
                    "${loan.borrower}　借于 ${loan.borrowed_at}" +
                        (loan.returned_at?.let { "　还于 $it" } ?: "　(未归还)"),
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }

    if (showBorrowDialog) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showBorrowDialog = false },
            title = { Text("借出给谁？") },
            text = {
                OutlinedTextField(
                    value = name, onValueChange = { name = it }, singleLine = true,
                    placeholder = { Text("借阅人姓名") }
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showBorrowDialog = false
                        onBorrow(name.trim())
                    },
                    enabled = name.isNotBlank()
                ) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { showBorrowDialog = false }) { Text("取消") }
            }
        )
    }

    if (showEditDialog) {
        var copiesText by remember { mutableStateOf(book.copies.toString()) }
        var location by remember { mutableStateOf(book.location ?: "") }
        AlertDialog(
            onDismissRequest = { showEditDialog = false },
            title = { Text("编辑馆藏") },
            text = {
                Column {
                    OutlinedTextField(
                        value = copiesText, onValueChange = { copiesText = it },
                        singleLine = true, label = { Text("馆藏数量") }
                    )
                    OutlinedTextField(
                        value = location, onValueChange = { location = it },
                        singleLine = true, label = { Text("存放位置") }
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showEditDialog = false
                        onUpdate(copiesText.toIntOrNull() ?: book.copies, location.trim())
                    }
                ) { Text("保存") }
            },
            dismissButton = {
                TextButton(onClick = { showEditDialog = false }) { Text("取消") }
            }
        )
    }
}
