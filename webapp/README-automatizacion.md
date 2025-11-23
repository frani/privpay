# Servicio Automatizado de Shield con Capa Intermedia de Privacidad

Este servicio automatiza el proceso de shield de tokens en RAILGUN, creando una capa intermedia de privacidad entre remitentes y destinatarios.

## 🎯 Objetivo

Crear un servicio que:
1. Recibe tokens en una dirección pública (visible para el remitente)
2. Automáticamente los blinda a una dirección 0zk intermedia
3. Transfiere privadamente los tokens al destinatario final 0zk

**Resultado**: El remitente y el destinatario nunca se conectan directamente, manteniendo la privacidad.

## 📋 Requisitos Previos

1. **Node.js** 18+ y npm
2. **Billetera con MATIC** para pagar gas fees
3. **Dirección 0zk intermedia** (crear en Railway Wallet)
4. **Acceso a RPC de Polygon**

## 🚀 Instalación

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales
```

## ⚙️ Configuración

Edita el archivo `.env`:

```env
RELAYER_PRIVATE_KEY=tu_clave_privada
RELAYER_PUBLIC_ADDRESS=0x...tu_direccion_publica
RELAYER_0ZK_ADDRESS=0zk1...tu_direccion_0zk_intermedia
RAILGUN_CONTRACT_ADDRESS=0x...contrato_railgun_polygon
POLYGON_RPC=https://polygon-rpc.com
```

> 💡 **¿Qué es la dirección pública del relayer?** 
> 
> Es la dirección de billetera tradicional (que comienza con `0x`) donde los remitentes envían tokens. Tu servicio la controla y la usa para recibir tokens antes de blindarlos. 
> 
> Para más detalles, consulta: [`explicacion-direcciones.md`](./explicacion-direcciones.md)

## 📝 Uso

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm run build
npm start
```

### Registrar Destinatarios

```typescript
// En src/index.ts o mediante API
service.registerRecipient(
  '0xRemitente...',
  '0zk1Destinatario...'
);
```

## 🔄 Flujo de Funcionamiento

1. **Remitente** envía tokens a `RELAYER_PUBLIC_ADDRESS`
2. **Servicio** detecta la transferencia (event listener)
3. **Servicio** busca el destinatario 0zk asociado al remitente
4. **Servicio** ejecuta shield automático a `RELAYER_0ZK_ADDRESS`
5. **Servicio** transfiere privadamente a la dirección 0zk del destinatario

## 🔒 Seguridad

### ⚠️ Importante

- **NUNCA** compartas tu clave privada
- Usa variables de entorno para credenciales
- En producción, usa servicios como OpenZeppelin Defender
- Implementa validación y rate limiting
- Monitorea todas las transacciones

### Mejores Prácticas

1. **Gestión de Claves**
   - Usa servicios de gestión de secretos (AWS Secrets Manager, HashiCorp Vault)
   - Implementa rotación de claves
   - Usa wallets multisig para producción

2. **Validación**
   - Verifica remitentes autorizados
   - Implementa límites de cantidad
   - Valida direcciones 0zk

3. **Monitoreo**
   - Logs de todas las operaciones
   - Alertas para transacciones fallidas
   - Dashboard de métricas

## 📊 Arquitectura Recomendada para Producción

```
┌─────────────┐
│   Cliente   │
│  (Remitente)│
└──────┬──────┘
       │ 1. Envía tokens
       ▼
┌─────────────────────┐
│ Dirección Pública   │
│    del Relayer      │
└──────┬──────────────┘
       │ 2. Event Listener
       ▼
┌─────────────────────┐
│  OpenZeppelin       │
│  Defender          │
│  (Sentinels)       │
└──────┬──────────────┘
       │ 3. Trigger
       ▼
┌─────────────────────┐
│  Autotask           │
│  (Lambda/Function)  │
└──────┬──────────────┘
       │ 4. Consulta DB
       ▼
┌─────────────────────┐
│  Base de Datos      │
│  (Redis/PostgreSQL) │
└──────┬──────────────┘
       │ 5. Obtiene destinatario
       ▼
┌─────────────────────┐
│  Relayer             │
│  (Firma transacción)│
└──────┬──────────────┘
       │ 6. Shield
       ▼
┌─────────────────────┐
│  Contrato RAILGUN   │
└─────────────────────┘
```

## 💰 Costos

- **Shield Fee**: 0.25% del monto
- **Gas Fee**: ~0.01-0.05 MATIC por shield
- **Transferencia Privada**: Sin fees
- **Total**: ~0.25% + 0.01-0.05 MATIC por transacción

## 🧪 Testing

```bash
# Ejecutar tests (cuando estén implementados)
npm test
```

### Testing en testnet de Polygon

1. Obtén MATIC de testnet desde un faucet
2. Configura `POLYGON_RPC` a la red de pruebas que prefieras
3. Usa direcciones de testnet
4. Prueba el flujo completo

## 📚 Recursos

- [RAILGUN Documentation](https://docs.railgun.org/)
- [Railway Wallet](https://app.railway.xyz/)
- [OpenZeppelin Defender](https://defender.openzeppelin.com/)
- [Polygon Documentation](https://docs.polygon.technology/)

## ⚠️ Limitaciones Actuales

1. **SDK de RAILGUN**: La transferencia privada requiere el SDK oficial (no incluido)
2. **Conversión 0zk**: La conversión de direcciones 0zk necesita el SDK
3. **Base de Datos**: Actualmente usa Map en memoria (usar DB en producción)

## 🔮 Próximos Pasos

- [ ] Integrar SDK oficial de RAILGUN
- [ ] Implementar base de datos persistente
- [ ] Configurar OpenZeppelin Defender
- [ ] Agregar API REST para registro de destinatarios
- [ ] Implementar sistema de autenticación
- [ ] Agregar dashboard de monitoreo
- [ ] Implementar retry logic y manejo de errores avanzado

## 📄 Licencia

MIT

