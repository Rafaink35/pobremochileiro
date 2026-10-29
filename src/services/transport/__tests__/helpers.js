import { zipSync, strToU8 } from 'fflate';

export const GTFS_FILES = {
  'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nA1,Viação Teste,https://example.org,America/Sao_Paulo\n',
  'stops.txt':
    'stop_id,stop_name,stop_lat,stop_lon\nS1,Terminal Rio,-22.9,-43.2\nS2,Terminal "Centro",-23.0,-43.3\nS3,Rodoviária SP,-23.5,-46.6\n',
  'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A1,100,Rio - São Paulo,3\n',
  'trips.txt': 'route_id,service_id,trip_id\nR1,WK,T1\nR1,WK,T2\n',
  'stop_times.txt': [
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
    'T1,23:00:00,23:00:00,S1,1',
    'T1,25:10:00,25:10:00,S3,2', // passa da meia-noite
    'T2,08:00:00,08:00:00,S1,1',
    'T2,,,S2,2', // horário vazio (intermediária)
    'T2,14:30:00,14:30:00,S3,3',
  ].join('\n'),
  'calendar.txt':
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20260101,20261231\n',
};

export function makeZip(overrides = {}) {
  const files = { ...GTFS_FILES, ...overrides };
  const data = {};
  for (const [name, content] of Object.entries(files)) if (content !== null) data[name] = strToU8(content);
  return zipSync(data);
}
