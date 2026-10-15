export function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8" role="status" aria-label="Loading">
      <span aria-hidden className="grid grid-cols-3 gap-[2px]">
        {[0, 108, 216, 756, 324, 648, 540, 432, 0].map((delay, index) => (
          <span
            key={index}
            className="blyp-lattice-cell size-1.5 rounded-[1.5px] bg-primary"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
