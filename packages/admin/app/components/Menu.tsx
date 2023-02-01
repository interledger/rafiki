import { NavLink } from '@remix-run/react'
import { cx } from 'class-variance-authority'

interface MenuItemProps {
  link: string
  name: string
}

const menuItems: MenuItemProps[] = [
  {
    link: '/peers',
    name: 'Peers'
  },
  { link: '/assets', name: 'Assets' }
]

const Menu = () => {
  return (
    <nav className='hidden min-w-[200px] lg:flex lg:flex-col space-y-5 py-5'>
      <h1 className='text-3xl font-medium'>Rafiki Admin</h1>
      <div className='flex flex-col space-y-2 pr-10'>
        {menuItems.map((item) => (
          <NavLink
            to={item.link}
            key={item.name}
            className={({ isActive }) =>
              cx(
                isActive ? 'bg-[#eee6e2]' : 'hover:bg-[#eee6e2]',
                'block p-2 pl-7 active:bg-[#eee6e2] rounded-md'
              )
            }
          >
            {item.name}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default Menu
