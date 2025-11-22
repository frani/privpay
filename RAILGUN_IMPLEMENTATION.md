# Implementación de Railgun

Este documento explica cómo se ha implementado Railgun en el proyecto PrivPay.

## ¿Qué es Railgun?

Railgun es un protocolo de privacidad blockchain que permite transacciones privadas mediante criptografía de conocimiento cero (ZK). Las direcciones Railgun (0zk) permiten:

- **Transacciones privadas**: Los saldos y transacciones no son visibles públicamente
- **Direcciones 0zk**: Direcciones privadas que comienzan con "0zk"
- **Shield/Unshield**: Proceso de mover tokens entre direcciones públicas y privadas

## Implementación Actual

### Frontend (`frontend/src/lib/railgun.ts`)

El frontend incluye funciones para:

1. **`generateRailgunFromPrivyWallet`**: Genera credenciales Railgun determinísticas desde la wallet de Privy
   - Crea un seed único basado en la dirección de wallet y el Privy ID
   - Deriva una dirección Railgun 0zk determinística
   - Retorna `railgunAddress` y `railgunPrivateKey`

2. **`isValidRailgunAddress`**: Valida el formato de direcciones Railgun

### Backend (`backend/src/services/railgunService.ts`)

El backend incluye:

1. **`isValidRailgunAddress`**: Valida el formato de direcciones Railgun
2. **`validateRailgunCredentials`**: Valida que las credenciales Railgun sean correctas
3. **`generateRailgunAddressFromSeed`**: Genera direcciones Railgun desde un seed (para uso interno)

### Flujo de Integración

1. **Usuario se registra**:
   - Conecta su wallet con Privy
   - El sistema genera automáticamente credenciales Railgun
   - Las credenciales se guardan en la base de datos

2. **Generación de Credenciales**:
   ```typescript
   const { railgunAddress, railgunPrivateKey } = await generateRailgunFromPrivyWallet(
     walletAddress,
     privyId
   )
   ```

3. **Validación en Backend**:
   - El backend valida el formato de la dirección Railgun
   - Guarda las credenciales en el modelo User

## Estructura de Datos

### Modelo User

```typescript
{
  privyId: string
  name: string
  email?: string
  walletAddress?: string
  railgunAddress: string      // Dirección 0zk de Railgun
  railgunPrivateKey: string   // Clave privada/seed para Railgun
}
```

## Limitaciones Actuales

⚠️ **Importante**: La implementación actual es una versión simplificada:

1. **Generación de Direcciones**: 
   - Actualmente genera direcciones 0zk simplificadas
   - En producción, debe usar el SDK completo de Railgun para generar direcciones válidas con claves Ed25519

2. **SDK de Railgun**:
   - Se ha instalado `@railgun-community/wallet` pero no se está usando completamente
   - Necesita inicialización del engine de Railgun para operaciones completas

3. **Transacciones Privadas**:
   - No se han implementado funciones de shield/unshield
   - No se han implementado transferencias privadas

## Próximos Pasos

Para una implementación completa de Railgun:

1. **Inicializar Railgun Engine**:
   ```typescript
   import { startRailgunEngine } from '@railgun-community/wallet'
   
   await startRailgunEngine({
     network: NetworkName.Polygon,
     // ... configuración adicional
   })
   ```

2. **Crear Wallet Real**:
   ```typescript
   import { createRailgunWallet } from '@railgun-community/wallet'
   
   const wallet = await createRailgunWallet(mnemonic, encryptionKey)
   const railgunAddress = wallet.getAddress()
   ```

3. **Implementar Shield/Unshield**:
   - Shield: Transferir tokens desde dirección pública a 0zk
   - Unshield: Transferir tokens desde 0zk a dirección pública

4. **Transferencias Privadas**:
   - Implementar transferencias entre direcciones 0zk
   - Usar pruebas ZK para mantener privacidad

## Recursos

- [Documentación de Railgun](https://docs.railgun.org/)
- [Railway Wallet](https://app.railway.xyz/)
- [SDK de Railgun en npm](https://www.npmjs.com/package/@railgun-community/wallet)

## Notas de Seguridad

🔒 **Importante**:

- Las `railgunPrivateKey` deben estar encriptadas en la base de datos
- Nunca expongas las claves privadas en el frontend
- Considera usar un servicio de encriptación para las claves privadas
- En producción, usa el SDK completo de Railgun para operaciones reales

## Uso Actual

La implementación actual permite:

✅ Generar direcciones Railgun determinísticas  
✅ Validar formato de direcciones  
✅ Guardar credenciales en la base de datos  
✅ Integración automática en el flujo de registro  

❌ No permite transacciones privadas aún  
❌ No permite shield/unshield de tokens  
❌ Las direcciones generadas son simplificadas (no válidas para transacciones reales)  

