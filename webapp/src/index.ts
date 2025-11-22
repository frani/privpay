import { AutomatedShieldService } from './shield-service';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Ejemplo de uso del servicio automatizado de shield
 */
async function main() {
  const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
  
  if (!PRIVATE_KEY) {
    console.error('❌ Error: RELAYER_PRIVATE_KEY no configurada en .env');
    process.exit(1);
  }

  console.log('🚀 Iniciando Servicio Automatizado de Shield\n');

  // Inicializar servicio
  const service = new AutomatedShieldService(PRIVATE_KEY);

  // Ejemplo: Registrar destinatarios
  // En producción, esto vendría de una base de datos o API
  console.log('📝 Registrando destinatarios...\n');
  
  // Ejemplo de registro
  // service.registerRecipient(
  //   '0xRemitente1...',
  //   '0zk1Destinatario1...'
  // );
  
  // service.registerRecipient(
  //   '0xRemitente2...',
  //   '0zk1Destinatario2...'
  // );

  // Iniciar monitoreo para diferentes tokens
  console.log('👂 Iniciando monitoreo de tokens...\n');

  // USDC en Polygon
  const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  await service.startMonitoring(USDC_POLYGON);

  // DAI en Polygon
  const DAI_POLYGON = '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063';
  await service.startMonitoring(DAI_POLYGON);

  // MATIC (nativo, requiere manejo especial)
  // await service.startMonitoring('0x0000000000000000000000000000000000001010');

  console.log('\n✅ Servicio en ejecución. Esperando transferencias...\n');
  console.log('   Presiona Ctrl+C para detener\n');

  // Mantener el proceso activo
  process.on('SIGINT', () => {
    console.log('\n\n👋 Deteniendo servicio...');
    process.exit(0);
  });
}

// Ejecutar
main().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});

