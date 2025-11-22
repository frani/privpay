# Implementación de Permit (EIP-2612)

Este documento explica cómo usar `permit` en lugar de `approve` para mejorar la UX y reducir costos de gas.

## ¿Qué es Permit (EIP-2612)?

`permit` permite que los usuarios autoricen transferencias de tokens mediante una **firma off-chain**, eliminando la necesidad de una transacción separada de `approve`.

### Ventajas

1. **Mejor UX**: El usuario solo firma un mensaje (más rápido, no requiere gas inmediato)
2. **Menos transacciones**: Puede combinarse con otras operaciones en una sola transacción
3. **Más seguro**: Incluye deadline, evitando aprobaciones permanentes

## Cómo Funciona

### Flujo Tradicional (approve)

```
1. Usuario → approve(spender, amount) [Transacción 1 - Gas]
2. Esperar confirmación
3. Usuario → shield() [Transacción 2 - Gas]
```

**Total: 2 transacciones, 2 pagos de gas**

### Flujo con Permit

```
1. Usuario → Firma mensaje permit (off-chain, sin gas)
2. Usuario → permit() + shield() en una transacción [Transacción 1 - Gas]
   O
2a. Usuario → permit() [Transacción 1 - Gas]
2b. Usuario → shield() [Transacción 2 - Gas]
```

**Total: 1-2 transacciones, pero mejor UX**

## Implementación Actual

### Frontend (`CheckoutPage.tsx`)

```typescript
// 1. Verificar si necesita aprobación
const allowance = await usdcContract.allowance(userAddress, railgunContractAddress)

if (allowance < amount) {
  // 2. Intentar usar permit
  try {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600) // 1 hora
    
    // Firmar permit off-chain
    const permitSignature = await signPermit(
      signer,
      usdcContract,
      userAddress,
      railgunContractAddress,
      amount,
      deadline
    )
    
    // Ejecutar permit on-chain
    await usdcContract.permit(
      userAddress,
      railgunContractAddress,
      amount,
      deadline,
      permitSignature.v,
      permitSignature.r,
      permitSignature.s
    )
  } catch (error) {
    // Fallback a approve si permit no está disponible
    await usdcContract.approve(railgunContractAddress, amount)
  }
}

// 3. Ejecutar shield
await railgunContract.shield(recipientBytes, tokenAddress, amountAfterFee)
```

## Función Helper: signPermit

```typescript
async function signPermit(
  signer: ethers.Signer,
  tokenContract: ethers.Contract,
  owner: string,
  spender: string,
  value: bigint,
  deadline: bigint
): Promise<{ v: number; r: string; s: string }> {
  // Obtener domain separator y nonce
  const domainSeparator = await tokenContract.DOMAIN_SEPARATOR()
  const nonce = await tokenContract.nonces(owner)

  // EIP-712 permit type hash
  const PERMIT_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
  )

  // Construir struct hash
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
      [PERMIT_TYPEHASH, owner, spender, value, nonce, deadline]
    )
  )

  // Construir message hash (EIP-712)
  const messageHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      ['0x19', '0x01', domainSeparator, structHash]
    )
  )

  // Firmar el mensaje
  const signature = await signer.signMessage(ethers.getBytes(messageHash))
  const sig = ethers.Signature.from(signature)

  return {
    v: sig.v,
    r: sig.r,
    s: sig.s,
  }
}
```

## Optimización: Permit + Shield en una Transacción

Para maximizar los beneficios, el contrato Railgun podría implementar una función que combine permit y shield:

```solidity
function shieldWithPermit(
    bytes32[2] calldata recipient,
    address token,
    uint256 amount,
    address owner,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external {
    // 1. Ejecutar permit
    IERC20Permit(token).permit(owner, address(this), amount, deadline, v, r, s);
    
    // 2. Ejecutar shield
    shield(recipient, token, amount);
}
```

**Ventaja**: Una sola transacción para permit + shield

## Compatibilidad

### Tokens que Soportan Permit

- ✅ USDC en Polygon (v2+)
- ✅ USDT en Polygon (v2+)
- ✅ DAI
- ✅ Muchos otros tokens modernos

### Verificar Soporte

```typescript
// Verificar si el token soporta permit
try {
  const domainSeparator = await tokenContract.DOMAIN_SEPARATOR()
  const nonce = await tokenContract.nonces(userAddress)
  // Si no lanza error, el token soporta permit
} catch (error) {
  // Token no soporta permit, usar approve
}
```

## Comparación de Costos

### Approve + Shield
- Approve: ~46,000 gas
- Shield: ~200,000 gas
- **Total: ~246,000 gas**

### Permit + Shield (separado)
- Permit: ~46,000 gas
- Shield: ~200,000 gas
- **Total: ~246,000 gas** (mismo costo, mejor UX)

### Permit + Shield (combinado)
- Permit + Shield: ~246,000 gas
- **Total: ~246,000 gas** (mismo costo, una transacción)

## Notas Importantes

1. **Deadline**: Siempre incluir un deadline razonable (ej: 1 hora) para evitar aprobaciones permanentes
2. **Nonce**: Cada permit debe usar el nonce correcto del owner
3. **Domain Separator**: Debe coincidir con el del contrato del token
4. **Fallback**: Siempre tener un fallback a `approve` si permit no está disponible

## Próximos Pasos

1. **Verificar si Railgun soporta permit directamente**
   - Si no, considerar crear un wrapper contract
   - O implementar `shieldWithPermit()` si es posible

2. **Optimizar para una sola transacción**
   - Si el contrato Railgun no soporta permit, crear un contrato wrapper
   - O usar meta-transacciones

3. **Mejorar UX**
   - Mostrar claramente que permit es más rápido
   - Explicar que es una firma, no una transacción

## Referencias

- [EIP-2612: permit](https://eips.ethereum.org/EIPS/eip-2612)
- [EIP-712: Typed structured data hashing](https://eips.ethereum.org/EIPS/eip-712)
- [OpenZeppelin Permit Implementation](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Permit)

