# GARUM — participación

Una sola página de Be Selkie. El visitante abre `/s/` y el ID del Portal, por ejemplo `/s/50378`.

No hay coordenadas ni clave secreta. La clave pública se escribe en `config.js` solo cuando las reglas de Supabase ya impiden leer y borrar.

Si el alojamiento cambia, `nuevaDireccion` en `config.js` pasa a ser la dirección nueva. Esta página redirige y el QR no se reimprime.
