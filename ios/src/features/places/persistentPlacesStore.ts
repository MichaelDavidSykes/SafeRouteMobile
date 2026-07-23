import AsyncStorage from "@react-native-async-storage/async-storage";

import { createPersistentPlacesStore } from "./persistentPlacesStoreCore";

export {
  PERSISTENT_PLACES_MAX_FAVOURITES,
  PERSISTENT_PLACES_MAX_RECENTS,
  type PersistentPlaceCoordinate,
  type PersistentPlaceInput,
  type PersistentPlacesRecord,
  type PersistentRecentDestination,
  type PersistentSavedPlace,
} from "./persistentPlacesModel";

export const persistentPlacesStore = createPersistentPlacesStore(AsyncStorage);
