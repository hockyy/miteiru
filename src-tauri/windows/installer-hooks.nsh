; Hooks for Tauri's NSIS installer (bundle.windows.nsis.installerHooks in tauri.windows.conf.json).

; The first 8.0.0 build (published 2026-11-07) installed its language data here: 21,315 files in
; language-assets. Later builds download languages instead, but an install over that build does not
; always remove them: reinstalling the same version and silent installs (/S) skip the uninstall of the
; old copy. Miteiru would then take the leftovers for bundled data, never offer the packs, and rebuild
; its dictionaries from them. So the folder goes before any file is copied; the full offline build
; (tauri.full.conf.json) copies its own right after.
!macro NSIS_HOOK_PREINSTALL
  ${If} ${FileExists} "$INSTDIR\language-assets\*.*"
    ; A running copy could hold files open, leaving half a folder behind: close it first, as the
    ; installer does before copying.
    !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
    RMDir /r "$INSTDIR\language-assets"
    ClearErrors
  ${EndIf}
!macroend
