/**
 * Lugares del mapa del panel. Salen de los viajes reales (nombre de plaza,
 * hospital, escuela, shopping o club), con la coordenada del edificio en
 * OpenStreetMap. No incluye calles con altura.
 */
export const MAP_LANDMARKS = [
  { id: 'hospital_papa_francisco', kind: 'hospital', label: 'Papa Francisco', lat: -24.840368, lng: -65.3914422 },
  { id: 'hospital_san_bernardo', kind: 'hospital', label: 'San Bernardo', lat: -24.792105, lng: -65.3994998 },
  { id: 'hospital_milagro', kind: 'hospital', label: 'Señor del Milagro', lat: -24.7820634, lng: -65.4165537 },
  { id: 'hospital_materno', kind: 'hospital', label: 'Materno Infantil', lat: -24.7721645, lng: -65.4156215 },
  { id: 'hospital_militar', kind: 'hospital', label: 'Hospital Militar', lat: -24.76899, lng: -65.422324 },
  { id: 'hospital_santa_clara', kind: 'hospital', label: 'Santa Clara', lat: -24.7918506, lng: -65.4159506 },
  { id: 'hospital_onativia', kind: 'hospital', label: 'Oñativia', lat: -24.7894083, lng: -65.3983337, labelSide: 'left' },
  { id: 'hospital_tres_cerritos', kind: 'hospital', label: 'Tres Cerritos', lat: -24.7656953, lng: -65.402994 },
  { id: 'hospital_san_roque', kind: 'hospital', label: 'San Roque', lat: -24.770126, lng: -65.3975058 },
  { id: 'hospital_el_carmen', kind: 'hospital', label: 'El Carmen', lat: -24.7871233, lng: -65.4147314 },
  { id: 'hospital_altos_de_salta', kind: 'hospital', label: 'Altos de Salta', lat: -24.7906418, lng: -65.4249216 },
  { id: 'hospital_modelo', kind: 'hospital', label: 'Sanatorio Modelo', lat: -24.7840535, lng: -65.4102954 },

  { id: 'terminal', kind: 'transport', glyph: 'T', label: 'Terminal', lat: -24.7955142, lng: -65.3985006 },
  { id: 'aeropuerto', kind: 'transport', glyph: 'A', label: 'Aeropuerto', lat: -24.8595387, lng: -65.4881531 },
  { id: 'estacion', kind: 'transport', glyph: 'E', label: 'Estación', lat: -24.7771893, lng: -65.4111904 },
  { id: 'teleferico', kind: 'culture', label: 'Teleférico', lat: -24.7939123, lng: -65.4016213, labelSide: 'left' },

  { id: 'catedral', kind: 'culture', label: 'Catedral', lat: -24.7882343, lng: -65.4103932 },
  { id: 'san_francisco', kind: 'culture', label: 'San Francisco', lat: -24.7904712, lng: -65.4080767, labelSide: 'left' },
  { id: 'virgen_del_cerro', kind: 'culture', label: 'Virgen del Cerro', lat: -24.7591984, lng: -65.3844516 },
  { id: 'plaza_9_de_julio', kind: 'plaza', label: '9 de Julio', lat: -24.789251, lng: -65.4102643, labelSide: 'left' },
  { id: 'plaza_gurruchaga', kind: 'plaza', label: 'Gurruchaga', lat: -24.7957824, lng: -65.4247235 },
  { id: 'plaza_alvarado', kind: 'plaza', label: 'Plaza Alvarado', lat: -24.7892286, lng: -65.4283356 },
  { id: 'grand_bourg', kind: 'plaza', label: 'Grand Bourg', lat: -24.7815067, lng: -65.4508423 },
  { id: 'paseo_guemes', kind: 'plaza', label: 'Paseo Güemes', lat: -24.7868821, lng: -65.4010723 },

  { id: 'ucasal', kind: 'school', label: 'UCASAL', lat: -24.7392431, lng: -65.3923888 },
  { id: 'colegio_estrada', kind: 'school', label: 'Estrada', lat: -24.7872946, lng: -65.4340481 },
  { id: 'escuela_normal', kind: 'school', label: 'Escuela Normal', lat: -24.7803425, lng: -65.4101807, labelSide: 'left' },
  { id: 'colegio_milagro', kind: 'school', label: 'Colegio Milagro', lat: -24.7919749, lng: -65.4083873 },

  { id: 'alto_noa', kind: 'shop', label: 'Alto NOA', lat: -24.7812496, lng: -65.4023547 },
  { id: 'carrefour', kind: 'shop', label: 'Carrefour', lat: -24.7796064, lng: -65.4273813 },
  { id: 'portal_salta', kind: 'shop', label: 'Portal Salta', lat: -24.7729222, lng: -65.4130819, labelSide: 'left' },

  { id: 'estadio_delmi', kind: 'sport', label: 'Delmi', lat: -24.7760489, lng: -65.4228 },
  { id: 'jockey_club', kind: 'sport', label: 'Jockey Club', lat: -24.8363732, lng: -65.4365433 },
  { id: 'el_aybal', kind: 'sport', label: 'El Aybal', lat: -24.8287597, lng: -65.4662184 },
];
