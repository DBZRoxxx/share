# Custom NSIS hooks, included by electron-builder (see `nsis.include`).

# Replaces electron-builder's check of the old uninstaller's result.
#
# On an update, the old uninstaller moves every file of the install folder out
# of the way; if any of them is locked it puts everything back and exits with 2.
# The stock installer gives up after ~5 s of retries with a cryptic dialog.
# Something other than Share (usually an antivirus scanning the unsigned files)
# can hold a file for longer than that, so keep trying for ~30 s before giving
# up with a message that says what to do.
#
# Runs inside `handleUninstallResult`; $R0 holds the uninstaller's exit code.
# $R7 is used as the counter (no `Var`: unused variables in the uninstaller
# build are warnings, and warnings are errors).
!macro customUnInstallCheck
  ${If} ${Errors}
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  ${Else}
    StrCpy $R7 0
    ${While} $R0 != 0
      ${If} $R7 >= 3
        ${ExitWhile}
      ${EndIf}
      IntOp $R7 $R7 + 1
      DetailPrint `Old uninstaller failed with code $R0, retrying ($R7/3)...`
      Sleep 4000
      ClearErrors
      Push SHELL_CONTEXT
      Call uninstallOldVersion
      ${If} ${Errors}
        # The old uninstaller can't be launched any more: nothing left to remove.
        StrCpy $R0 0
      ${EndIf}
    ${EndWhile}

    ${If} $R0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "Não foi possível substituir os arquivos do Share (código $R0).$\r$\n$\r$\nFeche o Share (ícone perto do relógio → Sair), verifique se o antivírus não está bloqueando a pasta do Share e rode o instalador de novo. Se continuar, reinicie o PC."
      DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend
