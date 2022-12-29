export const ContainerHome = (props) => {
  return (
      <div className={'border border-black rounded-lg bg-blue-100 p-3'}>
        {props.children}
      </div>
  )
}