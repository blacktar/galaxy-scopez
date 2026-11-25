#include "TapSignal.hpp"
#include <cassert>
#include <iostream>
int main(){
 assert(tap::uses709Basis(1));assert(!tap::uses709Basis(2));assert(tap::uses709Basis(3));
 assert(!tap::uses709Basis(4));assert(!tap::uses709Basis(5));assert(tap::signalMetadata(4).find("\"pq\"")!=std::string::npos);assert(tap::signalMetadata(5).find("\"hlg\"")!=std::string::npos);
 for(int choice:{1,2,3,4,5})std::cout<<tap::signalMetadata(choice)<<"\n";
}
