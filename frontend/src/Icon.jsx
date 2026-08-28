// Icono de Material Design (fuente ya cargada en main.jsx).
export default function Icon({ name, size }) {
  return (
    <span className="material-icons" style={size ? { fontSize: size } : undefined} aria-hidden="true">
      {name}
    </span>
  )
}
