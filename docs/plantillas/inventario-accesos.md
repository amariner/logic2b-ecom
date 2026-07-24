# Inventario de accesos — [Nombre del comercio]

> Anexo del acta de entrega. Deja escrito **qué cuentas existen, de quién son y
> quién tiene acceso**. Es el documento anti-sustos: si un día el cliente quiere
> cambiar de proveedor, con esta hoja cualquier profesional puede continuar.
>
> ⚠️ Aquí se apuntan titulares y direcciones, **NUNCA contraseñas**. Las
> contraseñas viven en el gestor de contraseñas de cada parte.

**Cliente:** [Nombre] · **Fecha:** [dd/mm/aaaa]

| Servicio | Para qué sirve | Titular de la cuenta | Email de la cuenta | Acceso de Logic2B |
|---|---|---|---|---|
| Dominio ([registrador]) | El nombre [dominio.com] | **Cliente** | [email] | [Delegado / No] |
| Cloudflare | Aloja la tienda y su base de datos | **Cliente** | [email] | Miembro invitado (para mantener) |
| Stripe | Cobros y transferencias al banco | **Cliente** | [email] | [Solo lectura / No] |
| Repositorio de código ([GitHub/…]) | El código fuente de la tienda | **Cliente** | [email] | Colaborador (para mantener) |
| Resend | Envío de los emails del pedido | [Cliente / Logic2B*] | [email] | [Admin] |
| Packlink / SendCloud | Etiquetas de envío | **Cliente** | [email] | No |
| Panel de la tienda ([dominio]/…) | Gestión diaria de pedidos | **Cliente** | [email] | Sí (para soporte) |

\* Si algún servicio quedó a nombre de Logic2B por comodidad en el arranque,
apuntarlo aquí con fecha comprometida de traspaso: [servicio] → [fecha].

## Reglas de la casa

1. **Todo lo que cobra, nombra o aloja la tienda es del cliente.** Logic2B solo
   tiene los accesos necesarios para mantener, y se retiran al terminar la
   relación.
2. Cambio de contraseñas: cada parte gestiona las suyas. Si el cliente cambia
   una que afecta al mantenimiento (Cloudflare, repositorio), avisa.
3. Baja del mantenimiento: Logic2B entrega una última copia de seguridad,
   retira sus accesos y lo firma al pie de esta hoja.

---

**Baja / retirada de accesos** (rellenar solo si aplica)

Fecha: [dd/mm/aaaa] · Copia de seguridad entregada: [Sí/No] · Firmas:
