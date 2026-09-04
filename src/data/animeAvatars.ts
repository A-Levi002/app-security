import { ImageSourcePropType } from 'react-native';

import avatarBeret from '../assets/images/anime_avatar_beret_1787432078318.jpg';
import avatarCatEar from '../assets/images/anime_avatar_cat_ear_1787432097460.jpg';
import avatarBoyBlue from '../assets/images/anime_avatar_boy_blue_1787432108698.jpg';
import avatarKitsune from '../assets/images/anime_avatar_kitsune_1787432121412.jpg';
import avatarDetective from '../assets/images/anime_avatar_detective_1787432134016.jpg';
import avatarMaidAmber from '../assets/images/anime_avatar_maid_amber_1787432165106.jpg';

export interface AnimeAvatarItem {
  id: string;
  name: string;
  category: 'retro-anime' | 'cyber' | 'fantasy' | 'casual';
  categoryLabel: string;
  // url identifica al recurso: para avatares locales es un id interno estable
  // (serializable en AsyncStorage), para avatares remotos es una URL http(s).
  url: string;
  description?: string;
}

export const ANIME_AVATARS: AnimeAvatarItem[] = [
  {
    id: 'av-beret',
    name: 'Misaki (Boina Borgoña)',
    category: 'retro-anime',
    categoryLabel: 'Retro Anime',
    url: 'av-beret',
    description: 'Cabello plateado ondulado con boina borgoña y ojos dorados'
  },
  {
    id: 'av-cat-ear',
    name: 'Yuki (Cat Ear)',
    category: 'cyber',
    categoryLabel: 'Cyber Cute',
    url: 'av-cat-ear',
    description: 'Coletas rosa pastel con audífonos gamer y ojos magenta'
  },
  {
    id: 'av-boy-blue',
    name: 'Ren (Midnight)',
    category: 'casual',
    categoryLabel: 'Urbano',
    url: 'av-boy-blue',
    description: 'Chico anime con cabello azul noche y ojos turquesa'
  },
  {
    id: 'av-kitsune',
    name: 'Ayame (Kitsune)',
    category: 'fantasy',
    categoryLabel: 'Fantasía',
    url: 'av-kitsune',
    description: 'Cabello blanco con orejas de zorro kitsune y ojos rubí'
  },
  {
    id: 'av-detective',
    name: 'Claire (Gafas Vintage)',
    category: 'retro-anime',
    categoryLabel: 'Retro Anime',
    url: 'av-detective',
    description: 'Cabello rubio miel con gafas retro y ojos esmeralda'
  },
  {
    id: 'av-maid',
    name: 'Koharu (Maid Amber)',
    category: 'retro-anime',
    categoryLabel: 'Retro Anime',
    url: 'av-maid',
    description: 'Cabello oscuro con diadema maid victoriana y ojos ámbar'
  }
];

// Mapa id -> recurso require local (para resolver en tiempo de render)
const AVATAR_SOURCES: Record<string, number> = {
  'av-beret': avatarBeret,
  'av-cat-ear': avatarCatEar,
  'av-boy-blue': avatarBoyBlue,
  'av-kitsune': avatarKitsune,
  'av-detective': avatarDetective,
  'av-maid': avatarMaidAmber,
};

export const DEFAULT_ANIME_AVATAR = 'av-beret';

// Resuelve una url/id de avatar a una fuente de imagen de React Native.
// - Si el valor es un id local conocido, devuelve el recurso require (ImageSource).
// - Si es una URL remota, devuelve `{ uri }`.
export function avatarSource(urlOrId: string | number | undefined | null): ImageSourcePropType {
  if (typeof urlOrId === 'number') {
    return urlOrId as ImageSourcePropType;
  }
  if (urlOrId && AVATAR_SOURCES[urlOrId]) {
    return AVATAR_SOURCES[urlOrId];
  }
  if (urlOrId) {
    return { uri: urlOrId };
  }
  return AVATAR_SOURCES[DEFAULT_ANIME_AVATAR];
}
