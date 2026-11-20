import Link from "next/link";
import { Icon } from "./icon";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="The Bếp — Trang đầu">
      <span className="brand-mark">
        <Icon name="leaf" size={25} />
      </span>
      <span>
        The Bếp<span className="brand-caption">TEAHOUSE · INVENTORY</span>
      </span>
    </Link>
  );
}
