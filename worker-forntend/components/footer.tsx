export const Footer = () => {
  return (
    <footer className=" relative bottom-0 left-0 z-15 w-full p-4 bg-black border-t border-gray-200 shadow md:flex md:items-center md:justify-between md:p-6">
      <span className="text-sm text-gray-500 sm:text-cente">
        © 2024{" "}
        <a href="https://tsoc.dev" className="hover:underline">
          Shradesh's codes™
        </a>
        . &nbsp; All Rights Reserved.
      </span>
      <span>
        Made by &#10084; with{" "}
        <a href="https://www.linkedin.com/in/shradesh-jodawat-147730265/" className="hover:text-red-400">
          Shradesh Jodawat
        </a>
      </span>
      <ul className="flex flex-wrap items-center mt-3 text-sm font-medium text-gray-500 sm:mt-0">
        <li>
          <a
            href="https://github.com/Shradhesh71/Decen-fiver"
            className="hover:underline me-4 md:me-6"
          >
            github
          </a>
        </li>
        <li>
          <a
            href="mailto:shradeshjain123@gmail.com"
            className="hover:underline me-4 md:me-6"
          >
            Feedback
          </a>
        </li>
      </ul>
    </footer>
  );
};
