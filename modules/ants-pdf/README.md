# AntsPdf (Android local Expo module)

Automatically linked from the app's default `modules/` directory. No config plugin is necessary. Build an Android development client or APK after adding this module; Expo Go and web do not contain it.

`extractText(fileUri)` reads a local file with PDFBox Android 2.0.27.0. Limits: 20 MiB, 100 pages, one million extracted characters. Password-protected/encrypted files are rejected. There is no OCR. Mixed documents report pages with no extractable text; whitespace-only pages cannot be distinguished reliably from scanned pages. No network request is made by this module. Gradle needs to download the PDFBox dependency on its first build.

Native acceptance: import a text PDF; 101-page PDF; scanned PDF; encrypted PDF; corrupt PDF; mixed text/scanned document. Confirm parsing errors reach the UI and failed copies are removed. JavaScript typechecking and browser preview cannot establish that native PDF parsing works.
