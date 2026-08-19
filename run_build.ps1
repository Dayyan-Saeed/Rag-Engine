cd C:\Users\Dayyan\Documents\my-project\frontend
$ErrorActionPreference = "Stop"
try {
    & npx next build 2>&1
} catch {
    # ignored
}