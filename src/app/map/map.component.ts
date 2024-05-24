import { environment } from '../../environments/environment';
import { Component, OnInit, OnDestroy } from '@angular/core';
import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import { countries } from '../data/countries';
import { allPlanesApi } from '../data/api';
import airportData from '../data/airports.json';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css'],
})
export class MapComponent implements OnInit, OnDestroy {
  map: mapboxgl.Map | undefined;
  popup: mapboxgl.Popup | undefined;
  style = 'mapbox://styles/mapbox/light-v11';
  lat: number = 39.911652;
  lng: number = 32.840305;
  zoom: number = 5;
  private isFetching = false;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.initializeMap();
    this.startFetchingPlanes();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
    this.isFetching = false;
  }

  private async startFetchingPlanes(): Promise<void> {
    this.isFetching = true;
    while (this.isFetching) {
      await this.fetchPlanes();
      await this.delay(1000);
    }
  }
  private async fetchPlanes(): Promise<void> {
    try {
      const response = await this.http.get<any>(allPlanesApi).toPromise();
      const planes = response.ac
        .filter(
          (plane: any) =>
            plane.lat !== 0 && plane.lon !== 0 && plane.flight !== undefined
        )
        .map((plane: any) => {
          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [plane.lon, plane.lat],
            },
            properties: {
              heading: plane.track || 0,
              flight: plane.flight,
            },
          };
        });

      const geojson: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: 'FeatureCollection',
        features: planes,
      };

      const source = this.map?.getSource('planes') as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData(geojson);
      }
    } catch (error) {
      console.error('Uçak verileri alınırken hata oluştu:', error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private initializeMap(): void {
    mapboxgl.accessToken = environment.mapboxAccessToken;
    this.map = new mapboxgl.Map({
      container: 'map',
      style: this.style,
      zoom: this.zoom,
      center: [this.lng, this.lat],
    });

    this.map.on('load', () => {
      // Havaalanı gösterimi
      this.map?.loadImage('../../assets/img/airport.png', (error, image) => {
        if (error) throw error;
        if (this.map && image) {
          this.map.addImage('airport-icon', image);
        }
      });

      const airports = Object.values(airportData);
      const features = airports.map((airport: any) => {
        return turf.point([airport.lon, airport.lat], {
          name: airport.name,
          iata: airport.iata,
          icao: airport.icao,
        });
      });

      const airportGeoJson = turf.featureCollection(features);

      this.map?.addSource('airports', {
        type: 'geojson',
        data: airportGeoJson,
      });

      this.map?.addLayer({
        id: 'airport',
        source: 'airports',
        type: 'symbol',
        layout: {
          'icon-image': 'airport-icon',
          'icon-size': 0.1,
        },
      });

      this.popup = new mapboxgl.Popup({ closeButton: false });

      this.map?.on('mousemove', 'airport', (e) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0];
          if (this.map) {
            this.map.getCanvas().style.cursor = 'pointer';
          }
          if (
            feature.geometry.type === 'Point' &&
            feature.geometry.coordinates
          ) {
            if (this.popup) {
              this.popup
                .setLngLat(feature.geometry.coordinates as [number, number])
                .setText(
                  `${feature.properties!['name']} (${
                    feature.properties!['iata']
                  })`
                )
                .addTo(this.map!);
            }
          }
        }
      });

      this.map?.on('mouseleave', 'airport', () => {
        if (this.map) {
          this.map.getCanvas().style.cursor = '';
          this.popup?.remove();
        }
      });

      // Uçaklar için kaynak ve katman ekleme
      this.map?.loadImage('../../assets/img/plane.png', (error, image) => {
        if (error) throw error;
        if (this.map && image) {
          this.map.addImage('plane-icon', image);
        }
      });

      this.map?.addSource('planes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      this.map?.addLayer({
        id: 'planes',
        source: 'planes',
        type: 'symbol',
        layout: {
          'icon-image': 'plane-icon',
          'icon-size': 0.05,
          'icon-allow-overlap': true,
          'icon-rotate': ['get', 'heading'],
        },
      });

      // Uçak mousemove popup olayı
      this.map?.on('mousemove', 'planes', (e) => {
        if (e.features && e.features.length > 0) {
          const feature = e.features[0];
          if (this.map) {
            this.map.getCanvas().style.cursor = 'pointer';
          }
          if (
            feature.geometry.type === 'Point' &&
            feature.geometry.coordinates
          ) {
            if (this.popup) {
              this.popup
                .setLngLat(feature.geometry.coordinates as [number, number])
                .setText(`Flight: ${feature.properties!['flight']}`)
                .addTo(this.map!);
            }
          }
        }
      });

      this.map?.on('mouseleave', 'planes', () => {
        if (this.map) {
          this.map.getCanvas().style.cursor = '';
          this.popup?.remove();
        }
      });

      // Antalya Havaalanı
      const antalya = turf.point([30.8005, 36.9038]);

      // Düsseldorf Havaalanı
      const dusseldorf = turf.point([6.7668, 51.2895]);

      // Antalya'dan Düsseldorf'a basit bir çizgi
      const route = turf.lineString([
        antalya.geometry.coordinates,
        dusseldorf.geometry.coordinates,
      ]);

      this.map?.addSource('route', {
        type: 'geojson',
        data: route,
      });

      this.map?.addLayer({
        id: 'route',
        source: 'route',
        type: 'line',
        layout: {},
        paint: {
          'line-color': '#888',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });

      // Ülke bölgeleri renklendirme
      this.map?.addSource('countries', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      });

      const matchExpression = [
        'match',
        ['get', 'iso_3166_1_alpha_3'],
      ] as mapboxgl.Expression;

      const data = countries.filter(
        (country) =>
          country.alpha3 === 'TUR' ||
          country.alpha3 === 'TKM' ||
          country.alpha3 === 'RUS' ||
          country.alpha3 === 'POL'
      );

      for (const country of data) {
        const color = 'rgba(254,197,11,0.8)';
        matchExpression.push(country.alpha3, color);
      }

      matchExpression.push('rgba(0, 0, 0, 0)');

      const WORLDVIEW = 'US';
      const worldview_filter = [
        'all',
        ['==', ['get', 'disputed'], 'false'],
        [
          'any',
          ['==', ['get', 'worldview'], 'all'],
          ['in', WORLDVIEW, ['get', 'worldview']],
        ],
      ];

      this.map?.addLayer(
        {
          id: 'countries-join',
          type: 'fill',
          source: 'countries',
          'source-layer': 'country_boundaries',
          paint: {
            'fill-color': matchExpression,
          },
          filter: worldview_filter,
        },
        'admin-1-boundary-bg'
      );
    });
  }
}
