[OPEN] Debug Session: mimaki-finecut-trace

## Contexto
- Objetivo: descobrir como o FineCut/Mimaki envia o job no Windows para reproduzir o mesmo fluxo no app.
- Ambiente: Windows, Illustrator 2024 com plugin FineCut, unitMDC/Mimaki Device Controller instalados.
- Sintoma atual: WebUSB enxerga a plotter mas falha em `claimInterface`; FineCut oficial envia, porém o payload ainda não foi capturado.

## Hipoteses
1. O FineCut envia o job para o `unitMDC` por socket local em `127.0.0.1:21114`, e o payload nunca passa por arquivo visível.
2. O FineCut gera um artefato temporário em `AppData` ou `Temp` e o apaga logo após o `unitMDC` consumir.
3. O envio usa DLL local como `USBFunction.dll` ou `msgMdcCtrlFunc.dll` com chamada direta em memória, sem hot folder persistente.
4. O `unitMDC` escreve detalhes do job em logs secundários ou arquivos rotativos fora das pastas já monitoradas.
5. O plugin FineCut mantém estado intermediário em `AppData\\Roaming\\Mimaki\\FineCut\\AI28` e só publica o comando final no momento do disparo.

## Evidencias Coletadas
- `unitMDC.exe` está rodando e ouvindo na porta `21114`.
- O envio pelo FineCut gerou alteração em `MDCLogOpen20260523.log` e em `MDCLog20260523_425.log`.
- Ainda não apareceu job novo em `C:\ProgramData\Mimaki\MDCShare\CreateCommand` nem `OutputData`.
- O monitor agressivo capturou um arquivo efêmero: `C:\Users\Direct\AppData\Roaming\Mimaki\FineCut\AI28\ENGLISH\FineCutSpool.tmp`, criado, alterado e deletado em sequência no momento do disparo.
- O capturador por polling conseguiu salvar `FineCutSpool.tmp`, mas em estado `0 bytes`, sugerindo que ele é um gatilho efêmero ou que o conteúdo útil é gravado/consumido rápido demais.
- O binário `Mimaki FineCutAI28.aip` contém as strings `FineCutSpool.tmp`, `USBFunction` e `LANFunction`.
- O binário `unitMDC.exe` contém as strings `127.0.0.1`, `MDCShare`, `CreateCommand` e `OutputData`.
- `USBFunction.dll` exporta `GetDeviceName`, `GetUSBPortName`, `USBPortCheck`, `USBPortOpen`, `USBPortWrite`, `USBPortClose`, `USBReadBuff` e `USBReadBuffClear`.
- `msgMdcCtrlFunc.dll` exporta `MsgMdcCtrlRequestPrint`, `MsgMdcCtrlRequestSingleCommand`, `MsgMdcCtrlGetDeviceList`, `MsgMdcCtrlGetDeviceStatus` e demais funções de fila/status.
- `MkdDeviceIf.dll` exporta `CreateInstance`, `SetConnectId`, `SetConnectSocket`, `MkdLoadInitialize`, `MkdQueryReadDataSize` e `ReleaseInstance`.
- O plugin `Mimaki FineCutAI28.aip` contém as strings `USBPortOpen`, `USBPortWrite`, `USBPortClose`, `USBPortCheck` e `GetUSBPortName`, indicando uso dinâmico direto da camada `USBFunction.dll`.
- O monitor da porta `21114` só viu `LISTEN` do `unitMDC`; não houve evidência de sessão TCP simples no disparo observado.

## Proximos Passos
1. Priorizar a ponte Windows em cima de `USBFunction.dll`, porque é a camada que o plugin aparenta usar para USB.
2. Em paralelo, manter `msgMdcCtrlFunc.dll` como trilha secundária para filas/status e comandos isolados.
3. Descobrir assinaturas mínimas das funções `USBPortOpen`/`USBPortWrite` para montar um POC de envio fora do Illustrator.
