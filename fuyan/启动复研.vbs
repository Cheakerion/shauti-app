' Fuyan MedReview launcher (no console window)
' Starts the local server hidden; the server opens the app window itself.
' If an instance is already running, the server focuses it and exits.
' NOTE: keep this file ASCII-only. WSH reads .vbs as ANSI, so non-ASCII
' characters can break parsing on some systems.
Option Explicit
Dim sh, fso, dir, nodeExe, rc

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

If Not fso.FileExists(dir & "\server.js") Then
  MsgBox "server.js not found. Keep the launcher in the app folder.", 16, "Fuyan"
  WScript.Quit 1
End If

' Runtime: PATH node -> bundled runtime\node. If neither, show a dialog that
' offers to download a portable Node.js into the app folder (no admin needed).
If Not fso.FileExists(dir & "\runtime\node\node.exe") Then
  rc = sh.Run("powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\tools\ensure-node.ps1""", 0, True)
  If rc <> 0 Then WScript.Quit rc
End If

If fso.FileExists(dir & "\runtime\node\node.exe") Then
  nodeExe = dir & "\runtime\node\node.exe"
Else
  nodeExe = "node"
End If

sh.Run """" & nodeExe & """ server.js", 0, False
