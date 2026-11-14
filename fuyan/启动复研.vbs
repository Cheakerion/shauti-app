' Fuyan MedReview launcher (no console window)
' Starts the local server hidden; the server opens the app window itself.
' If an instance is already running, the server focuses it and exits.
' NOTE: keep this file ASCII-only. WSH reads .vbs as ANSI, so non-ASCII
' characters can break parsing on some systems.
Option Explicit
Dim sh, fso, dir, nodeExe, dshNode

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

If Not fso.FileExists(dir & "\server.js") Then
  MsgBox "server.js not found. Keep the launcher in the app folder.", 16, "Fuyan"
  WScript.Quit 1
End If

nodeExe = "node"
If sh.Run("cmd /c where node >nul 2>nul", 0, True) <> 0 Then
  dshNode = sh.ExpandEnvironmentStrings("%USERPROFILE%") & ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
  If fso.FileExists(dshNode) Then
    nodeExe = dshNode
  Else
    MsgBox "Node.js 18+ is required. Install Node.js and run again.", 16, "Fuyan"
    WScript.Quit 1
  End If
End If

sh.Run """" & nodeExe & """ server.js", 0, False
