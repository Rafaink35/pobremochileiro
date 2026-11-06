// SNAPSHOTS DE RESPOSTAS REAIS do Nominatim (nominatim.openstreetmap.org), colhidos em 06/11/2026 pelo teste controlado e
// abreviados aos campos usados. NÃO são fixtures inventadas: servem para impedir regressão em casos reais (dados © OpenStreetMap contributors, ODbL).
const r = (osm_type, osm_id, addresstype, cc, importance, display_name, lat, lon, boundingbox, name) => ({
  osm_type, osm_id, addresstype, type: 'administrative', importance, display_name, lat: String(lat), lon: String(lon), boundingbox, name,
  address: { country_code: cc, country: cc.toUpperCase() }, namedetails: { name },
});
export const REAL = {
  Lisboa: [
    r('relation', 5400890, 'city', 'pt', 0.7635, 'Lisboa, Portugal', 38.708, -9.137, ['38.6914', '38.7967', '-9.2298', '-9.0864'], 'Lisboa'),
    r('relation', 2897141, 'county', 'pt', 0.5597, 'Lisboa, Portugal', 38.995, -9.144, ['38.7, ', '39.3', '-9.5', '-8.9'].map((x) => x.trim().replace(/,$/, '')), 'Lisboa'),
  ],
  'Buenos Aires': [
    r('relation', 1224652, 'city', 'ar', 0.7828, 'Buenos Aires, Comuna 1, Autonomous City of Buenos Aires, Argentina', -34.61, -58.389, ['-34.7055', '-34.5265', '-58.5315', '-58.3351'], 'Buenos Aires'),
    r('relation', 1632167, 'state', 'ar', 0.6747, 'Buenos Aires, Argentina', -36.379, -60.386, ['-41.0', '-33.3', '-63.4', '-56.6'], 'Buenos Aires'),
    r('relation', 6268475, 'county', 'cr', 0.4298, 'Buenos Aires, Puntarenas Province, Costa Rica', 9.08, -83.229, ['8.8', '9.4', '-83.5', '-82.9'], 'Buenos Aires'),
  ],
  Santiago: [
    r('relation', 6282288, 'village', 'cr', 0.729, 'Santiago, Paraíso, Cartago, 30202, Costa Rica', 9.869, -83.798, ['9.85', '9.89', '-83.82', '-83.78'], 'Santiago'),
    r('node', 50016356, 'city', 'cl', 0.729, 'Santiago, Provincia de Santiago, Região Metropolitana de Santiago, 8320000, Chile', -33.438, -70.651, ['-33.5', '-33.4', '-70.7', '-70.6'], 'Santiago'),
    r('relation', 5919053, 'municipality', 'cu', 0.583, 'Santiago de Cuba, Distrito Antonio Maceo, Santiago de Cuba, Cuba', 20.021, -75.829, ['19.9', '20.1', '-75.9', '-75.7'], 'Santiago de Cuba'),
    r('relation', 7380638, 'city', 'do', 0.536, 'Santiago de los Caballeros, Santiago, República Dominicana', 19.451, -70.695, ['19.4', '19.5', '-70.75', '-70.6'], 'Santiago de los Caballeros'),
    r('relation', 242308, 'town', 'br', 0.53, 'Santiago, Rio Grande do Sul, Região Sul, Brasil', -29.19, -54.867, ['-29.4', '-28.9', '-55.1', '-54.6'], 'Santiago'),
  ],
  Paraty: [
    r('relation', 1277591, 'municipality', 'br', 0.4889, 'Paraty, Rio de Janeiro, Região Sudeste, 23970-000, Brasil', -23.22, -44.715, ['-23.4', '-23.0', '-44.9', '-44.5'], 'Paraty'),
    r('relation', 296537, 'municipality', 'br', 0.4871, 'Araquari, Santa Catarina, Região Sul, Brasil', -26.37, -48.721, ['-26.5', '-26.2', '-48.9', '-48.5'], 'Paraty'), // achado só por nome alternativo
    r('relation', 14602147, 'city_district', 'br', 0.16, 'Paraty, Rio de Janeiro, Região Sudeste, 23970-000, Brasil', -23.157, -44.764, ['-23.25', '-23.06', '-44.86', '-44.67'], 'Paraty'),
    r('relation', 6888640, 'neighbourhood', 'br', 0.1334, 'Paraty, Quadrante Sudoeste, Pouso Alegre, Minas Gerais, Região Sudeste', -22.287, -45.914, ['-22.289', '-22.285', '-45.916', '-45.912'], 'Paraty'),
  ],
  Tóquio: [r('relation', 1543125, 'province', 'jp', 0.834, 'Tóquio, Japão', 35.6768, 139.7638, ['20.2145811', '35.8984245', '135.8536855', '154.2055410'], 'Tóquio')],
  Paris: [
    r('relation', 71525, 'city', 'fr', 0.897, 'Paris, Ilha de França, França metropolitana, França', 48.8535, 2.3484, ['48.8155', '48.9021', '2.2241', '2.4699'], 'Paris'),
    r('relation', 7444, 'suburb', 'fr', 0.897, 'Paris, Ilha de França, França metropolitana, França', 48.8535, 2.3484, ['48.8155', '48.9021', '2.2241', '2.4699'], 'Paris'),
    r('relation', 115357, 'town', 'us', 0.53, 'Paris, Lamar County, Texas, Estados Unidos da América', 33.66, -95.55, ['33.6', '33.7', '-95.6', '-95.5'], 'Paris'),
  ],
};
