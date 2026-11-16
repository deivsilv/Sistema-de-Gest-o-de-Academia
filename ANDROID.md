# SteakUp Android

O aplicativo Android usa Capacitor 8.6.2 com a interface React incluída no APK e o mesmo Supabase do site. ID do aplicativo: br.com.steakup.app. Versão inicial: 1.0.0 (versionCode 1). Android mínimo: 7/API 24, com WebView atualizado; compile/target SDK: 36. Não é um APK gerado pelo navegador nem uma abertura remota do site.

## Gerar novamente

No terminal da pasta academia-app, execute `npm run android:apk`. O script faz build web, sincroniza os arquivos/plugins, compila release, alinha e assina o APK. O resultado fica em android/app/build/outputs/apk/release/SteakUp-1.0.0.apk. A assinatura é de produção; não usa a debug.keystore.

O build utiliza um JDK 21 portátil em C:/Users/warsd/.cache/steakup-android/jdk21 e o SDK em C:/Users/warsd/AppData/Local/Android/Sdk. O Java padrão do computador foi preservado. Em outra máquina, instale JDK 21 e SDK 36/build-tools 36.0.0 e configure STEAKUP_JAVA_HOME e ANDROID_HOME. A licença Android SDK foi aceita explicitamente pelo usuário antes da instalação. O caminho local do SDK não é versionado.

## Chave de assinatura — backup privado

A chave e sua configuração ficam fora do projeto, em C:/Users/warsd/.local/share/steakup/signing. Faça backup privado dessa pasta. Ela contém a chave de assinatura e sua senha; não envie ao GitHub, Vercel ou a outras pessoas. As próximas versões precisam ser assinadas com a mesma chave para atualizar o app já instalado. Não é possível recuperar uma chave perdida a partir do APK.

Para uma nova versão, aumente versionCode e versionName em android/app/build.gradle e ajuste o nome versionado nos scripts sign-apk.mjs, prepare-vercel.mjs e no header de download em vercel.json. Em seguida gere o APK e publique novamente. Alterações do site não atualizam o código incluído em um APK já instalado; os dados do banco continuam atualizados ao consultar a internet.

## Comportamento e permissões

O PWA e o site continuam disponíveis. Dentro do APK não há botão de instalar PWA, registro de service worker nem atualização pelo worker. A sessão é separada da sessão do navegador; entre com a mesma conta do Supabase. Os perfis e as restrições por pagamento/plano continuam no banco. A origem HTTPS local do Capacitor foi acrescentada à lista exata de CORS da função administrativa, com JWT e validação de ADMIN ativo preservados. HTTP local sem porta continua recusado.

A chave Pix é copiada pelo plugin Clipboard no Android. O seletor padrão de arquivos atende PNG/JPEG/PDF para comprovantes; não há permissão ampla de acesso aos arquivos. O link assinado de comprovante é encaminhado ao navegador do celular, usando Browser, para abertura/download de imagem/PDF. As margens das barras do sistema são tratadas pelo Capacitor para evitar sobreposição dos controles. Backup do aplicativo e tráfego HTTP foram desativados; depuração de WebView está desativada no release.

## Distribuição

`npm run prepare:vercel` inclui o APK assinado no diretório de distribuição, separado dos arquivos web de public/. Isso evita que o próximo APK inclua uma cópia de si mesmo. O artefato público não contém chave de assinatura, senha, .env, backend ou documentos. O APK usa somente a URL e a chave publicável do Supabase; a chave service_role não participa do cliente.

O arquivo distribuído fora da Play Store pode exigir autorização de instalação do navegador ou passar por análise do Play Protect. Uma assinatura própria e target SDK atualizado não garantem ausência de avisos. Não desative o Play Protect para contornar bloqueios. Instalação real, login, envio/abertura de comprovante, copiar Pix e layout com teclado precisam de aceite em dispositivo físico; não havia dispositivo Android conectado durante a geração.

Referências: https://capacitorjs.com/docs/android ; https://capacitorjs.com/docs/config ; https://capacitorjs.com/docs/apis/browser ; https://capacitorjs.com/docs/apis/clipboard .

## Verificações da versão 1.0.0

Build de produção concluído com assembleRelease e lintVitalRelease. Assinatura RSA 3072 verificada com apksigner (esquemas v2 e v3) e alinhamento de 16 KB verificado. O pacote compilado declara minSdkVersion 24 e targetSdkVersion 36; nome/ID/versão conferidos via aapt2. Release sem flag debuggable. Permissões declaradas: INTERNET e a permissão interna de receiver não exportado gerada pelo AndroidX. Não há permissão de SMS, contatos, câmera ou armazenamento amplo.

Os plugins Browser e Clipboard foram encontrados no APK final. A interface está incluída em assets/public; não existe server.url remoto na configuração. Não há keystore ou arquivos .env no pacote. Os testes financeiros (17), Pix (5), PWA (5) e função administrativa (12) passaram. CORS remoto nativo HTTPS retornou 204; HTTP local sem porta foi recusado com 403; origem do site continuou aceita.

Tamanho do APK final: 3.400.522 bytes. SHA-256: 4a0abf8aa769914efbae526a478d03b8344bbea6023f5abe24a47ebb1ac2c12b.

Certificado de assinatura SHA-256: a09237812193bc5cfa0a6b145410aac4c3b2db62d4a7db628a22e87fc066eea4.

## Download publicado

https://steakup.vercel.app/downloads/SteakUp-1.0.0.apk

Download público conferido: HTTP 200, MIME application/vnd.android.package-archive, Content-Disposition attachment e SHA-256 idêntico ao APK assinado local. O site também respondeu HTTP 200 após a publicação. O APK ainda não foi instalado/testado em dispositivo físico.
