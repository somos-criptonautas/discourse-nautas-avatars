# discourse-nautas-avatars

[ENGLISH](README.md) | **ESPAÑOL**

Mantenido por Criptonautas. Sin afiliación ni respaldo de Discourse (Civilized Discourse Construction Kit, Inc.).

Generador de avatares autoalojado para el ajuste `external_system_avatars_url` de Discourse.
Reemplaza los avatares de letra sin enviar nombres de usuario a terceros (todo se
renderiza en local, en el servidor, sin peticiones salientes).

## Qué hace

`GET /:variant/:size/:username` devuelve un avatar SVG determinista, renderizado en el
servidor (sin navegador, sin canvas, sin llamadas a ninguna API de avatares de terceros).

- `variant`: uno de `beam`, `marble`, `pixel`, `sunset`, `ring`, `bauhaus` (todos de
  [boring-avatars](https://www.npmjs.com/package/boring-avatars), mediante
  `renderToStaticMarkup` de `react-dom/server`), o `notionists-neutral` (mediante
  [`@dicebear/core`](https://www.npmjs.com/package/@dicebear/core) +
  [`@dicebear/notionists-neutral`](https://www.npmjs.com/package/@dicebear/notionists-neutral),
  con las opciones de estilo por defecto: solo se pasan `seed` (= nombre de usuario) y `size`).
  Cualquier otro valor → 400.
- `size`: entero entre 16 y 512. Cualquier otro valor → 400.
- `username`: decodificado de la URL, máximo 60 caracteres, usado solo como hash/semilla (nunca se registra). Cualquier otro valor → 400.
- Cualquier otra ruta, o una barra final → 404. Métodos distintos de GET/HEAD → 405.
- La paleta de Boring Avatars está fijada al Color System v0.3 de la marca: `#462C6D`, `#B24B38`,
  `#14110F`, `#E8E6E1`, `#7E7973`. `notionists-neutral` usa su propia paleta por defecto
  (sin sobrescribir).
- `square: false` para boring-avatars; ver "Cuadrado o círculo" más abajo.

## Ejecutar en local

```sh
pnpm install
node server.js            # PORT=8787 HOST=127.0.0.1 por defecto
curl -s http://127.0.0.1:8787/beam/128/satoshi -o avatar.svg
```

## Ejecutar en Docker

```sh
docker build -t discourse-nautas-avatars .
docker run --rm -p 127.0.0.1:8787:8787 discourse-nautas-avatars
```

El contenedor escucha en `0.0.0.0:8787` internamente (definido con `ENV HOST` en el Dockerfile);
la exposición al host la controla la opción `-p`, como en cualquier otro servicio en contenedor.

## Autocomprobación

```sh
node --test
```

Cubre: petición válida → imagen con el `Content-Type` correcto; mismo nombre de usuario → bytes
idénticos (determinismo, tanto para `beam` como para `notionists-neutral`); tamaño, variante o
nombre de usuario inválidos → 400; ruta desconocida o barra final → 404.

## Ajustes de Discourse

Configura (Admin → Ajustes → busca "avatar"):

```
external_system_avatars_url = https://avatars.criptonautas.co/beam/{size}/{username}
```

Discourse sustituye `{size}` y `{username}` (y `{color}`/`{first_letter}`, que aquí no se usan)
en `User.system_avatar_template`; ver `app/models/user.rb`, alrededor de las líneas 1258-1270. La
expresión regular de validación del ajuste (`^((https?:)?\/)?\/.+[^\/]`) solo exige que no termine
en barra, y esta URL lo cumple.

**Desactiva `automatically_download_gravatars`.** Las consultas a Gravatar envían la *dirección
de correo* del usuario (hasheada, pero igualmente identificable) a los servidores de Gravatar, un
tercero, lo que anula el sentido de autoalojar avatares en un foro centrado en la privacidad. Con
el ajuste desactivado, Discourse nunca hace la llamada a Gravatar y usa
`external_system_avatars_url` para los usuarios sin avatar subido.

Tras probar, para volver al valor original:

```
external_system_avatars_url = /letter_avatar_proxy/v4/letter/{first_letter}/{color}/{size}.png
```

## SVG o PNG: decisión y evidencia

**Decisión: SVG.** Sin rasterizador, sin dependencias extra.

Evidencia, `app/controllers/user_avatars_controller.rb`:

- `show_proxy_letter` (~líneas 36-50) es la *única* acción que hace de proxy o descarga una
  URL de avatar en el servidor, y solo se ejecuta cuando
  `SiteSetting.external_system_avatars_url !~ %r{\A/letter_avatar_proxy}` es falso, es decir,
  solo para la ruta de avatares de letra del CDN propio de Discourse
  (`avatars.discourse-cdn.com/.../letter/...`). Nuestra URL no coincide con ese prefijo, así que
  ese camino nunca la toca.
- Para cualquier otra `external_system_avatars_url`, `User.system_avatar_template`
  (`app/models/user.rb` ~líneas 1258-1270) hace una simple sustitución de texto
  (`url.gsub! "{username}", ...`) y devuelve la URL tal cual. Discourse nunca descarga,
  decodifica, redimensiona ni recodifica esos bytes en ningún punto de la petición: la URL se
  incrusta directamente en `avatar_template` y se envía a quien la consuma (`<img src>` en la
  web, la API JSON, `avatar_template_url` para correos). El cliente pide la imagen directamente a
  nuestro servidor; el proceso Ruby de Discourse nunca ve los píxeles.
- Las notificaciones push usan un icono estático por sitio
  (`app/services/push_notification_pusher.rb` ~líneas 19-20,
  `SiteSetting.site_push_notifications_icon_url`), no el avatar del usuario, así que ese camino
  tampoco exige PNG.
- No se encontró ningún camino en el que Discourse use el `avatar_template` de un usuario como
  `og:image`/`twitter:image` (esos usan subidas del post o del tema,
  `app/helpers/application_helper.rb` ~líneas 357-568), así que no aplica ningún requisito de
  imagen rasterizada de OpenGraph a los avatares por usuario.

Como Discourse nunca rasteriza ni valida el formato, y quienes lo consumen son navegadores
modernos y la API JSON de Discourse (ambos muestran `<img>` SVG sin problema), SVG es suficiente.
Riesgo aceptado: clientes de correo muy antiguos que no muestran SVG en línea (por ejemplo,
Outlook de escritorio heredado) mostrarán una imagen rota o vacía para el avatar en los correos de
resumen; es una degradación aceptable, no un fallo funcional. Añadir `@resvg/resvg-js` y
rasterizar a PNG más adelante si se mide que importa.

## Licencia de `notionists-neutral`

Revisados la cabecera del código fuente y el README incluido en
`node_modules/@dicebear/notionists-neutral` (DiceBear incluye la información de licencia en línea,
no como un archivo `LICENSE` aparte en este paquete):

- **Código**: MIT (paquetes `@dicebear/core` y `@dicebear/notionists-neutral`, copyright
  Florian Körner).
- **Diseño/ilustración**: "Notionists" de Zoish (<https://heyzoish.gumroad.com/l/notionists>),
  con licencia **CC0 1.0** (dedicación al dominio público,
  <https://creativecommons.org/publicdomain/zero/1.0/>). El estilo de DiceBear es una remezcla
  del original. CC0 implica que legalmente no hace falta atribución, pero DiceBear acredita igual
  a la artista original (ver <https://www.dicebear.com/licenses> para el resumen completo); este
  proyecto hace lo mismo, aquí.

Ambas licencias permiten este uso (autoalojado, sin redistribuir código más allá de la propia
dependencia de npm) sin restricciones.

## Cuadrado o círculo

Discourse ya recorta los avatares en círculo con CSS (`border-radius: 50%` en `.avatar`), así que
una imagen cuadrada funciona bien; por eso se mantuvo `square: false` en lugar de forzarlo a `true`.

## Privacidad

El servidor nunca registra nombres de usuario ni rutas de petición: solo el estado HTTP y el
tiempo de respuesta de cada petición (ver `server.js`). No hace ninguna llamada de red saliente.

## Proxy inverso

Ejecútalo detrás de tu proxy inverso con su propio nombre de host (por ejemplo `avatars.example.com`
→ `127.0.0.1:8787`), con caché de larga duración y sin registros de acceso: las rutas de las
peticiones contienen nombres de usuario.

## Licencia

MIT. Consulta [LICENSE](LICENSE). Los estilos de avatar conservan sus propias licencias (arriba).

Texto de este README bajo [CC BY-NC-SA 4.0](CC-BY-NC-SA-4.0.txt).
