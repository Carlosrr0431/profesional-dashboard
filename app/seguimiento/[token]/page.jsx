import TrackingView from './TrackingView';

export async function generateMetadata() {
  return {
    title: 'Seguimiento de viaje en vivo',
    description: 'Seguí tu viaje en tiempo real con Profesional App.',
  };
}

export default async function Page({ params }) {
  const { token } = await params;
  return <TrackingView token={token} />;
}
