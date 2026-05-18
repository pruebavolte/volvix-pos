' Wrapper invisible para lanzar el watcher SIN flashar ventana.
' VBScript ejecuta powershell con WindowStyle=0 (totalmente oculto).
' Asi la Scheduled Task no muestra ninguna ventana cada vez que dispara.

Set sh = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
starter = scriptDir & "\start-watcher.ps1"
cmd = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -NoProfile -File """ & starter & """"
sh.Run cmd, 0, False
