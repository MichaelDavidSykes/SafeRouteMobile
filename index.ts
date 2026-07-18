import { registerRootComponent } from 'expo';

import { configureNetworkAvailabilityContract } from './src/features/api/networkAvailabilityContract';
import './src/features/live-map/backgroundNavigationTask';
import App from './App';

configureNetworkAvailabilityContract();
registerRootComponent(App);
