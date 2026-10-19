package expo.modules.antspdf

import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AntsPdfModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AntsPdf")
    AsyncFunction("extractText") { uri: String ->
      val context = appContext.reactContext ?: throw CodedException("ERR_PDF_CONTEXT", "无法访问应用文件，请重新打开应用。", null)
      val parsed = Uri.parse(uri)
      if (parsed.scheme != "file") throw CodedException("ERR_PDF_URI", "PDF 必须先复制到应用本地目录。", null)
      val file = File(parsed.path ?: "")
      if (!file.isFile) throw CodedException("ERR_PDF_MISSING", "PDF 文件不存在，请重新导入。", null)
      if (file.length() > 20L * 1024 * 1024) throw CodedException("ERR_PDF_SIZE", "PDF 不可超过 20 MB。", null)
      PDFBoxResourceLoader.init(context.applicationContext)
      try {
        PDDocument.load(file).use { document ->
          if (document.isEncrypted) throw CodedException("ERR_PDF_PASSWORD", "此 PDF 已加密，请先导出不加密的副本。", null)
          if (!document.currentAccessPermission.canExtractContent()) throw CodedException("ERR_PDF_PERMISSION", "此 PDF 禁止提取文字，请使用允许复制文字的副本。", null)
          val pages = document.numberOfPages
          if (pages > 100) throw CodedException("ERR_PDF_PAGES", "PDF 共 $pages 页，首版最多支持 100 页。", null)
          if (pages == 0) throw CodedException("ERR_PDF_EMPTY", "PDF 没有页面。", null)
          val stripper = PDFTextStripper()
          stripper.sortByPosition = true
          val output = StringBuilder()
          var blankPages = 0
          for (page in 1..pages) {
            stripper.startPage = page
            stripper.endPage = page
            val text = stripper.getText(document).trim()
            if (text.isBlank()) blankPages++
            output.append("\n\n--- 第 $page 页 ---\n").append(text)
            if (output.length > 1000000) throw CodedException("ERR_PDF_TEXT_LIMIT", "PDF 文字过多，请拆分后导入。", null)
          }
          if (blankPages == pages) throw CodedException("ERR_PDF_SCAN", "此 PDF 未提取到文字，可能是扫描件。首版不支持 OCR，请使用带文字层的 PDF。", null)
          mapOf("text" to output.toString().trim(), "pages" to pages, "blankPages" to blankPages)
        }
      } catch (error: InvalidPasswordException) {
        throw CodedException("ERR_PDF_PASSWORD", "此 PDF 需要密码，请先解密后导入。", error)
      } catch (error: CodedException) {
        throw error
      } catch (error: Exception) {
        throw CodedException("ERR_PDF_PARSE", "PDF 无法解析，文件可能损坏或格式不受支持。", error)
      }
    }
  }
}
