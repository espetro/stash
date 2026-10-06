export default function OptionsFooter() {
  return (
    <div className="flex justify-center">
      <span className="version">App version: v{import.meta.env.APP_VERSION}</span>
    </div>
  );
}
